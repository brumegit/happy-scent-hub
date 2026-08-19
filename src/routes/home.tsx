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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkConnection, disconnect, isRealLink, pairDiffuser, sendFrames } from "@/lib/bluetooth";
import {
  INTENSITIES,
  activeDays,
  buildPushFrames,
  formatDays,
  formatHourRanges,
  formatSeconds,
  intensityPreset,
  scheduleStatus,
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
      <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-8">
        <AppHeader />

        {empty ? (
          <section className="mt-10 border border-border bg-card p-7">
            <h1 className="font-display text-4xl leading-tight">Connect your diffuser</h1>
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

            <div className="mt-8 space-y-5">
              {!hydrated && <div className="h-52 animate-pulse border border-border bg-card" />}
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
          </>
        )}
      </div>
    </div>
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
  const [editingSettings, setEditingSettings] = useState(false);

  useEffect(() => {
    void checkConnection(diffuser.device_id).then(setConnected);
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [diffuser.device_id]);

  const schedule = draft ?? diffuser.schedule;
  const preset = intensityPreset(diffuser.intensity);
  const dirty = draft !== null;

  async function connect() {
    setConnecting(true);
    setError(null);
    try {
      const paired = await pairDiffuser();
      updateDiffuser(diffuser.id, { device_id: paired.deviceId });
      setConnected(isRealLink(paired.deviceId));
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
   * Renames the diffuser inside the app. The ScentLife protocol has no
   * set name command, so nothing is written over Bluetooth here.
   */
  function renameDevice(next: string) {
    updateDiffuser(diffuser.id, { name: next });
  }

  async function push(nextIntensity: Intensity, nextSchedule: DaySchedule[]) {
    setPushing(true);
    setResult("idle");
    setError(null);
    try {
      await sendFrames(diffuser.device_id, buildPushFrames(nextSchedule, nextIntensity));
      updateDiffuser(diffuser.id, {
        intensity: nextIntensity,
        schedule: nextSchedule,
        last_pushed_at: new Date().toISOString(),
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
      <article className="border border-border bg-card p-7">
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
    <article className="border border-border bg-card p-7" style={{ boxShadow: "var(--shadow-soft)" }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={nameDraft}
                aria-label="Diffuser name"
                onChange={(e) => setNameDraft(e.target.value)}
                className="h-9 w-56"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const next = nameDraft.trim();
                  if (next) void renameDevice(next);
                  setEditingName(false);
                }}
              >
                Save
              </Button>
            </div>
          ) : (
            <h2 className="font-display text-2xl tracking-wide">{diffuser.room}</h2>
          )}
          <p className="mt-1 text-sm text-gold">{diffuser.name}</p>
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
                className="absolute right-0 top-8 z-20 w-44 border border-border bg-card p-1 text-sm"
              >
                {confirmRemove ? (
                  <div className="p-2">
                    <p className="mb-2 text-xs text-muted-foreground">Remove this diffuser?</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        role="menuitem"
                        className="flex-1 border border-destructive bg-background px-2 py-1 text-xs text-destructive hover:opacity-80"
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
                        className="flex-1 border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
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
              Weekly schedule
            </p>
            <p className="mt-3 font-display text-xl">{formatDays(activeDays(schedule))}</p>
            <p className="text-sm text-muted-foreground">
              {formatHourRanges(schedule.find((d) => d.active)?.hours ?? [])}
            </p>

            <div className="mt-4">
              <ScheduleGrid schedule={schedule} onChange={setDraft} />
            </div>


            {dirty && (
              <div className="mt-4">
                <StatusButton
                  state="idle"
                  icon={false}
                  label="Send schedule to diffuser"
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
  const preset = intensityPreset(diffuser.intensity);
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
            <dd>{formatDays(activeDays(diffuser.schedule))}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Hours</dt>
            <dd className="text-right">
              {formatHourRanges(diffuser.schedule.find((d) => d.active)?.hours ?? [])}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}
