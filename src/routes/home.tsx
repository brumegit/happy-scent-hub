import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bluetooth, CalendarClock, ChevronDown, Gauge, Plus } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { GuestBanner } from "@/components/GuestBanner";
import { ScheduleGrid } from "@/components/ScheduleGrid";
import { StatusButton, type CircleState } from "@/components/StatusButton";
import { useHydrated } from "@/hooks/useHydrated";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { isRealLink, pairDiffuser, sendFrames } from "@/lib/bluetooth";
import {
  DAYS,
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
      { title: "My diffusers — Brume" },
      { name: "description", content: "See your Brume diffuser, its intensity and its weekly schedule." },
      { property: "og:title", content: "My diffusers — Brume" },
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
    <div className="relative min-h-screen">
      <GuestBanner />
      <div className="relative mx-auto max-w-3xl px-6 py-8">
        <AppHeader />

        {empty ? (
          <section className="mt-10 border border-border bg-card p-7">
            <h1 className="font-display text-4xl uppercase leading-tight">Connect your diffuser</h1>
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
                <h1 className="font-display text-4xl uppercase">
                  {status === "matched" && firstName ? `${firstName}'s diffusers` : "Your diffusers"}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Intensity and schedule, always one tap away.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DiffuserCard({ diffuser }: { diffuser: Diffuser }) {
  const updateDiffuser = useDiffuserStore((s) => s.updateDiffuser);
  const [draft, setDraft] = useState<DaySchedule[] | null>(null);
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<CircleState>("idle");
  const [error, setError] = useState<string | null>(null);

  const schedule = draft ?? diffuser.schedule;
  const preset = intensityPreset(diffuser.intensity);
  const dirty = draft !== null;

  async function push(nextIntensity: Intensity, nextSchedule: DaySchedule[]) {
    setPushing(true);
    setResult("idle");
    setError(null);
    try {
      await sendFrames(diffuser.device_id, buildPushFrames(nextSchedule, nextIntensity));
      updateDiffuser(diffuser.id, { intensity: nextIntensity, schedule: nextSchedule });
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
          <h2 className="font-display text-2xl uppercase tracking-wide">{diffuser.name}</h2>
          <p className="mt-1 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-foreground">
            <Bluetooth className="size-4" aria-hidden />
            Connected
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {diffuser.schedule_active ? "Schedule on" : "Paused"}
          </span>
          <Switch
            checked={diffuser.schedule_active}
            aria-label="Toggle schedule"
            onCheckedChange={(checked) => updateDiffuser(diffuser.id, { schedule_active: checked })}
          />
        </div>
      </div>

      <div className="mt-6 border border-border bg-secondary/30 p-5">
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
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-secondary/60"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Spray {formatSeconds(preset.onSeconds)} · Pause {formatSeconds(preset.offSeconds)} — allow
          30 minutes for the room to adapt.
        </p>
      </div>

      <div className="mt-4 border border-border bg-secondary/30 p-5">
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

        <div className="mt-4 flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <span
              key={day.value}
              className={`border px-3 py-1 text-xs ${
                schedule.find((d) => d.day === day.value)?.active
                  ? "border-foreground/60 text-foreground"
                  : "border-border text-muted-foreground/60"
              }`}
            >
              {day.short}
            </span>
          ))}
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
    </article>
  );
}
