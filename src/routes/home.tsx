import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Battery,
  BatteryCharging,
  BatteryLow,
  Bluetooth,
  CalendarClock,
  ChevronDown,
  Gauge,
  MoreVertical,
  Pencil,
  Plus,
  PowerOff,
  Trash2,
} from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { GuestBanner } from "@/components/GuestBanner";
import { ScheduleGrid } from "@/components/ScheduleGrid";
import { StatusButton, type CircleState } from "@/components/StatusButton";
import { useHydrated } from "@/hooks/useHydrated";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_BROADCAST_NAME_BYTES, validateBroadcastName } from "@/lib/scentlife";
import {
  checkConnection,
  disconnect,
  getBatteryStatus,
  pairDiffuser,
  requestBattery,
  subscribeBattery,
} from "@/lib/bluetooth";
import { pushName, pushSettings } from "@/lib/push";
import {
  INTENSITIES,
  activeDays,
  hardwareName,
  formatDays,
  formatMinuteRanges,
  dayRanges,
  formatScheduleLines,
  formatSeconds,

  intensityPreset,
  scheduleStatus,
  scheduleToBlocks,

  type DaySchedule,
  type Intensity,
} from "@/lib/diffuser";
import { useDiffuserStore, type Diffuser } from "@/stores/diffuserStore";
import { useIdentityStore } from "@/stores/identityStore";


export const Route = createFileRoute("/home")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "My diffusers | Brume" },
      { name: "description", content: "See your Brume diffuser, its intensity and its weekly schedule." },
      { property: "og:title", content: "My diffusers | Brume" },
      { property: "og:description", content: "Your diffuser, intensity and weekly schedule at a glance." },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const diffusers = useDiffuserStore((s) => s.diffusers);
  const hydrated = useHydrated();
  const firstName = useIdentityStore((s) => s.firstName);
  const status = useIdentityStore((s) => s.status);

  const empty = hydrated && diffusers.length === 0;

  return (
    <div className="relative min-h-screen flex flex-col">
      <GuestBanner />
      <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">
        <AppHeader />

        {empty ? (
          <div className="flex flex-1 flex-col justify-center">
            <section className="border border-border p-7">
              <h1 className="font-display text-4xl leading-tight">Start pairing</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Pair your diffuser to set its intensity and weekly schedule.
              </p>
              <div className="mt-7">
                <StatusButton
                  state="idle"
                  label="Start now"
                  onClick={() => navigate({ to: "/setup", search: { start: true } })}
                />
              </div>
            </section>
          </div>
        ) : (
          <>
            <div className="mt-10 flex items-end justify-between gap-4">
              <div>
                <h1 className="font-display text-4xl">
                  {status === "matched" && firstName ? `${firstName}'s diffusers` : "Your diffusers"}
                </h1>
              </div>
              <Button asChild variant="secondary" size="sm">
                <Link to="/setup" search={{ start: false }}>
                  <Plus className="size-4" aria-hidden />
                  Add
                </Link>
              </Button>
            </div>

            <div className="flex flex-1 flex-col justify-center">
              <div className="space-y-5 py-8">
                {!hydrated && <div className="h-52 animate-pulse border border-border" />}
                {diffusers.map((diffuser) => (
                  <DiffuserCard key={diffuser.id} diffuser={diffuser} />
                ))}
                {hydrated && diffusers.length > 0 && (
                  <Button asChild variant="secondary" className="w-full">
                    <Link to="/setup" search={{ start: false }}>
                      <Plus className="size-4" aria-hidden />
                      Add a diffuser
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Battery level of the connected diffuser. The protocol has no "read battery"
 * command: the module reports it inside its runtime status frames (0x21/0x22/
 * 0x23), so the app polls it with the silent query command and acknowledges the
 * reports it receives. Until the first report lands a placeholder is shown.
 */
function BatteryIndicator({ deviceId }: { deviceId: string | null }) {
  const [status, setStatus] = useState(() => getBatteryStatus(deviceId));

  useEffect(() => {
    setStatus(getBatteryStatus(deviceId));
    const unsubscribe = subscribeBattery(() => setStatus(getBatteryStatus(deviceId)));
    void requestBattery(deviceId);
    const poll = setInterval(() => void requestBattery(deviceId), 30_000);
    return () => {
      unsubscribe();
      clearInterval(poll);
    };
  }, [deviceId]);

  const low = !!status && (status.lowBattery || status.percent <= 20);
  const Icon = status?.charging ? BatteryCharging : low ? BatteryLow : Battery;
  return (
    <p
      className={`flex items-center gap-2 text-xs uppercase tracking-[0.18em] ${
        low ? "text-destructive" : "text-foreground"
      }`}
      aria-label={status ? `Battery ${status.percent} percent` : "Reading battery level"}
    >
      <Icon className="size-4" aria-hidden />
      {status ? `${status.percent}%` : "--"}
    </p>
  );
}


function DiffuserCard({ diffuser }: { diffuser: Diffuser }) {
  const updateDiffuser = useDiffuserStore((s) => s.updateDiffuser);
  const removeDiffuser = useDiffuserStore((s) => s.removeDiffuser);
  const [draft, setDraft] = useState<DaySchedule[] | null>(null);
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<CircleState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [showLast, setShowLast] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(diffuser.name);
  const [roomDraft, setRoomDraft] = useState(diffuser.room);
  const [editingSettings, setEditingSettings] = useState(false);
  // Only the room name is broadcast over Bluetooth, so only it is validated.
  const roomDraftError = roomDraft.trim() ? validateBroadcastName(roomDraft) : "Enter a room name.";
  const combinedDraftError = roomDraftError
    ? null
    : validateBroadcastName(hardwareName(nameDraft, roomDraft));


  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void checkConnection(diffuser.device_id).then((live) => {
        if (!cancelled) setConnected(live);
      });
    };
    refresh();
    setNow(new Date());
    // Re-check the physical link often: a diffuser that went out of range or was
    // taken over by another phone must stop showing as connected.
    const link = setInterval(refresh, 4000);
    const clock = setInterval(() => setNow(new Date()), 60_000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(link);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [diffuser.device_id]);

  const schedule = draft ?? diffuser.schedule;
  const preset = intensityPreset(diffuser.intensity);
  const dirty = draft !== null;

  async function connect() {
    setConnecting(true);
    setError(null);
    try {
      // Re-connecting a known diffuser: auto-select it by its hardware label.
      const paired = await pairDiffuser({
        preferName: hardwareName(diffuser.name, diffuser.room),
      });
      updateDiffuser(diffuser.id, { device_id: paired.deviceId });
      setConnected(await checkConnection(paired.deviceId));
    } catch (err) {
      setError((err as Error).message || "Could not connect to the diffuser.");
    } finally {
      setConnecting(false);
    }
  }

  async function disconnectDevice() {
    await disconnect(diffuser.device_id);
    setConnected(false);
    setEditingSettings(false);
    setMenuOpen(false);
  }


  /**
   * Renames the diffuser and pushes the new "Device name - Room name" label to
   * the module's BLE advertising name (0x52) when it is connected.
   */
  async function saveNames() {
    const name = nameDraft.trim();
    const room = roomDraft.trim();
    if (!name || !room) return;
    updateDiffuser(diffuser.id, { name, room });
    setEditingName(false);
    try {
      await pushName(diffuser.device_id, hardwareName(name, room));
    } catch {
      // Not connected — the name is stored in the app and pushed on next sync.
    }
  }

  async function push(nextIntensity: Intensity, nextSchedule: DaySchedule[]) {
    setPushing(true);
    setResult("idle");
    setError(null);
    try {
      await pushSettings({
        deviceId: diffuser.device_id,
        schedule: nextSchedule,
        intensity: nextIntensity,
        hardwareName: hardwareName(diffuser.name, diffuser.room),
      });
      updateDiffuser(diffuser.id, {
        intensity: nextIntensity,
        schedule: nextSchedule,
        last_pushed_at: new Date().toISOString(),
        last_pushed_intensity: nextIntensity,
        last_pushed_schedule: nextSchedule,
      });

      setDraft(null);
      setResult("success");
      setTimeout(() => {
        setResult("idle");
        setPushing(false);
      }, 1400);
    } catch (err) {
      setError((err as Error).message || "Could not reach the diffuser.");
      setResult("error");
      setTimeout(() => {
        setResult("idle");
        setPushing(false);
      }, 2400);
    }
  }

  if (pushing) {
    return (
      <article className="border border-border p-7">
        <StatusButton
          state={result === "idle" ? "pairing" : result}
          icon={result !== "idle"}
          label={result === "success" ? "OK" : result === "error" ? "Error" : "Sending"}
        />
        {result === "error" && error && (
          <p className="mt-4 text-center text-sm text-destructive">{error}</p>
        )}
      </article>
    );
  }

  return (
    <article className="border border-border p-7" style={{ boxShadow: "var(--shadow-soft)" }}>
      {editingName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6">
          <div
            role="dialog"
            aria-label="Edit diffuser"
            className="w-full max-w-sm border border-border p-6"
          >
            <h3 className="font-display text-2xl">Edit diffuser</h3>
            <label className="mt-5 block text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Room name
            </label>
            <Input
              value={roomDraft}
              aria-label="Room name"
              onChange={(e) => setRoomDraft(e.target.value)}
              className="mt-2"
            />
            {roomDraftError && <p className="mt-2 text-xs text-destructive">{roomDraftError}</p>}
            <label className="mt-4 block text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Diffuser name
            </label>
            <Input
              value={nameDraft}
              aria-label="Diffuser name"
              onChange={(e) => setNameDraft(e.target.value)}
              className="mt-2"
            />
            <p className="mt-3 text-xs text-muted-foreground">
              The diffuser broadcasts as "{hardwareName(nameDraft, roomDraft)}" — the room name must
              stay within {MAX_BROADCAST_NAME_BYTES} characters, letters, numbers, spaces, hyphens
              and underscores only.
              {combinedDraftError && (
                <span className="block text-destructive">{combinedDraftError}</span>
              )}
            </p>
            <div className="mt-6 flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setEditingName(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={() => void saveNames()} disabled={!!roomDraftError || !!combinedDraftError}>
                Save

              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl tracking-wide">{diffuser.room}</h2>
          <p className="mt-1 text-sm text-gold">{diffuser.name}</p>
          {connected && (
            <div className="mt-4 flex items-center gap-4">
              <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-foreground">
                <Bluetooth className="size-4" aria-hidden />
                Connected
              </p>
              <BatteryIndicator deviceId={diffuser.device_id} />
            </div>
          )}
        </div>
        <div className="relative flex items-center gap-3">
          <button
            type="button"
            aria-label="Diffuser options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="text-muted-foreground hover:text-foreground"
          >
            <MoreVertical className="size-5" aria-hidden />
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setMenuOpen(false)}
              />
              <div
                role="menu"
                className={`absolute right-0 top-8 z-20 border border-border p-1 text-sm ${
                  confirmRemove ? "w-60" : "w-44"
                }`}
              >
                {confirmRemove ? (
                  <div className="p-5">
                    <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
                      Remove this diffuser?
                    </p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        role="menuitem"
                        className="flex-1 border border-destructive bg-background px-3 py-2.5 text-xs text-destructive hover:opacity-80"
                        onClick={() => {
                          removeDiffuser(diffuser.id);
                          setMenuOpen(false);
                          setConfirmRemove(false);
                        }}
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex-1 border border-border bg-background px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setConfirmRemove(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {connected && (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:text-foreground"
                        onClick={() => void disconnectDevice()}
                      >
                        <PowerOff className="size-4" aria-hidden />
                        Disconnect
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:text-muted-foreground"
                      onClick={() => {
                        setNameDraft(diffuser.name);
                        setRoomDraft(diffuser.room);
                        setEditingName(true);
                        setMenuOpen(false);
                      }}
                    >
                      <Pencil className="size-4" aria-hidden />
                      Edit name
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:opacity-80"
                      onClick={() => setConfirmRemove(true)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                      Remove
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {!connected ? (
        <div className="mt-5">
          <StatusButton
            state={connecting ? "pairing" : "idle"}
            label={connecting ? "Searching" : "Tap to edit"}
            onClick={() => void connect()}
          />
          {error && <p className="mt-3 text-center text-sm text-destructive">{error}</p>}
          <div className="mt-4">
            <LastSettings
              diffuser={diffuser}
              open={showLast}
              onToggle={() => setShowLast((v) => !v)}
            />
          </div>
        </div>
      ) : (
        <>
          <p className="mb-6 mt-5 border-l-2 border-gold pl-3 text-sm text-muted-foreground">
            {now
              ? scheduleStatus(diffuser.schedule, diffuser.schedule_active, now, preset.label)
              : "Checking the current schedule…"}
          </p>

          <LastSettings
            diffuser={diffuser}
            open={showLast}
            onToggle={() => setShowLast((v) => !v)}
          />

          <div className="mt-4">
            <StatusButton
              state="idle"
              icon={false}
              label={editingSettings ? "Close settings" : "Edit settings"}
              onClick={() => setEditingSettings((v) => !v)}
            />
          </div>

          {editingSettings && (
          <>
          <div className="mt-6 border border-border p-5">
            <p className="flex items-center gap-2 eyebrow text-muted-foreground">
              <Gauge className="size-4" aria-hidden />
              Intensity
            </p>
            <div className="mt-3 flex gap-2">
              {INTENSITIES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={diffuser.intensity === option.value}
                  onClick={() => push(option.value, schedule)}
                  className={`flex-1 border px-3 py-2 text-sm transition-colors ${
                    diffuser.intensity === option.value
                      ? "border-gold bg-background text-gold"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Spray {formatSeconds(preset.onSeconds)} · Pause {formatSeconds(preset.offSeconds)}
              <br />
              Allow 30 minutes for the room to adapt.
            </p>
          </div>

          <div className="mt-4 border border-border p-5">
            <p className="flex items-center gap-2 eyebrow text-muted-foreground">
              <CalendarClock className="size-4" aria-hidden />
              {scheduleToBlocks(schedule).length > 1
                ? "My diffusion routines"
                : "My diffusion routine"}
            </p>
            <p className="mt-3 font-display text-xl">{formatDays(activeDays(schedule))}</p>
            <p className="text-sm text-muted-foreground">
              {(() => {
                const first = schedule.find((d) => d.active);
                return first ? formatMinuteRanges(dayRanges(first)) : "No hours selected";
              })()}
            </p>

            <div className="mt-4">
              <ScheduleGrid schedule={schedule} onChange={setDraft} />
            </div>


            {dirty && (
              <div className="mt-4">
                <StatusButton
                  state="idle"
                  icon={false}
                  label="Send routine to diffuser"
                  onClick={() => void push(diffuser.intensity, schedule)}
                />
              </div>
            )}
          </div>
          </>
          )}
        </>
      )}
    </article>
  );
}

function formatPushedAt(iso: string | null) {
  if (!iso) return "Never pushed yet";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function LastSettings({
  diffuser,
  open,
  onToggle,
}: {
  diffuser: Diffuser;
  open: boolean;
  onToggle: () => void;
}) {
  // Report exactly what was last written to the hardware, not the current draft.
  const pushedSchedule = diffuser.last_pushed_schedule ?? diffuser.schedule;
  const preset = intensityPreset(diffuser.last_pushed_intensity ?? diffuser.intensity);
  const lines = formatScheduleLines(pushedSchedule);
  return (
    <div className="border border-border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 bg-background px-4 py-3 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
      >
        Last used settings
        <ChevronDown
          className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <dl className="space-y-2 border-t border-border px-4 py-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Pushed on</dt>
            <dd className="text-right">{formatPushedAt(diffuser.last_pushed_at)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Intensity</dt>
            <dd>{preset.label}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Spray / pause</dt>
            <dd>
              {formatSeconds(preset.onSeconds)} / {formatSeconds(preset.offSeconds)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Days</dt>
            <dd>{formatDays(activeDays(pushedSchedule))}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="shrink-0 text-muted-foreground">Hours</dt>
            <dd className="space-y-1 text-right">
              {lines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </dd>
          </div>
        </dl>
      )}

    </div>
  );
}
