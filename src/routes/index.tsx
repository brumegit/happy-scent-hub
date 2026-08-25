import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
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
import { bluetoothRequirementPrompt, useBluetoothRequirements } from "@/hooks/useBluetoothRequirements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_BROADCAST_NAME_BYTES, validateBroadcastName } from "@/lib/scentlife";
import {
  checkConnection,
  disconnect,
  pairDiffuser,
} from "@/lib/bluetooth";
import { pushName, pushSettings } from "@/lib/push";
import {
  INTENSITIES,
  blocksFromSchedule,
  routineName,
  hardwareName,
  formatMinuteRanges,
  dayRanges,
  formatSeconds,


  intensityPreset,
  scheduleStatus,
  scheduleToBlocks,

  type DaySchedule,
  type Intensity,
} from "@/lib/diffuser";
import { useDiffuserStore, type Diffuser } from "@/stores/diffuserStore";
import { useIdentityStore } from "@/stores/identityStore";
import { openAppSettings, openLocationSettings } from "@/lib/native-ble";


export const Route = createFileRoute("/")({
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

  // With no diffuser there is no home to show — setup is the whole app.
  useEffect(() => {
    if (empty) void navigate({ to: "/setup", search: { start: false }, replace: true });
  }, [empty, navigate]);

  return (
    <div className="relative min-h-screen flex flex-col">
      <GuestBanner />
      <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pb-8">
        <div className="sticky top-0 z-40 -mx-6 bg-background px-6 pb-8">
          <AppHeader />
        </div>

        {empty ? null : (
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

function DiffuserCard({ diffuser }: { diffuser: Diffuser }) {
  const navigate = useNavigate();
  const updateDiffuser = useDiffuserStore((s) => s.updateDiffuser);
  const removeDiffuser = useDiffuserStore((s) => s.removeDiffuser);
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

  const preset = intensityPreset(diffuser.intensity);


  async function connect() {
    setConnecting(true);
    setError(null);
    try {
      // Always let the user choose; never filter or auto-select a peripheral.
      const paired = await pairDiffuser();
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
    setMenuOpen(false);
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




  return (
    <article
      className="relative isolate overflow-hidden border border-border px-2 py-7"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
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
          <div>
            <h2 className="font-display text-2xl tracking-wide">{diffuser.room}</h2>
            <p className="mt-1 text-sm text-gold">{diffuser.name}</p>
          </div>
          {connected && (
            <p className="mt-4 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-foreground">
              <Bluetooth className="size-4" aria-hidden />
              Connected
            </p>
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
                className={`absolute right-0 top-8 z-20 border border-border bg-background p-1 text-sm ${
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
          {error && <p className="mt-3 whitespace-pre-line text-center text-sm text-destructive">{error}</p>}
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
              label="Edit settings"
              onClick={() =>
                void navigate({ to: "/setup", search: { edit: diffuser.id } })
              }
            />
          </div>

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
  // Routine names describe the pushed time blocks better than raw day/hour lines.
  const routines = blocksFromSchedule(pushedSchedule).map(routineName);
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
            <dt className="shrink-0 text-muted-foreground">Routines</dt>
            <dd className="space-y-1 text-right">
              {routines.length ? (
                routines.map((name, i) => <div key={`${name}-${i}`}>{name}</div>)
              ) : (
                <div>No routine</div>
              )}
            </dd>
          </div>
        </dl>
      )}

    </div>
  );
}
