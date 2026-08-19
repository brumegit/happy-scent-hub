import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Bluetooth, CalendarClock, Gauge, Plus } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { GuestBanner } from "@/components/GuestBanner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DAYS, INTENSITIES, formatDays, formatTime, type Intensity } from "@/lib/diffuser";
import { useDiffuserStore, type Diffuser } from "@/stores/diffuserStore";
import { useIdentityStore } from "@/stores/identityStore";

export const Route = createFileRoute("/home")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "My diffusers — Brume" },
      { name: "description", content: "See your Brume diffuser, its intensity and its active schedule." },
      { property: "og:title", content: "My diffusers — Brume" },
      { property: "og:description", content: "Your diffuser, intensity and active schedule at a glance." },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const diffusers = useDiffuserStore((s) => s.diffusers);
  const hydrated = useDiffuserStore((s) => s.hydrated);
  const firstName = useIdentityStore((s) => s.firstName);
  const status = useIdentityStore((s) => s.status);

  useEffect(() => {
    if (hydrated && diffusers.length === 0) navigate({ to: "/setup", replace: true });
  }, [hydrated, diffusers.length, navigate]);

  return (
    <div className="relative min-h-screen">
      <GuestBanner />
      <div className="relative mx-auto max-w-3xl px-6 py-8">
        <AppHeader />

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
            <Link to="/setup">
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
      </div>
    </div>
  );
}

function DiffuserCard({ diffuser }: { diffuser: Diffuser }) {
  const updateDiffuser = useDiffuserStore((s) => s.updateDiffuser);

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
              onClick={() => updateDiffuser(diffuser.id, { intensity: option.value as Intensity })}
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
      </div>

      <div className="mt-4 border border-border bg-secondary/30 p-5">
        <p className="flex items-center gap-2 eyebrow text-muted-foreground">
          <CalendarClock className="size-4" aria-hidden />
          Active schedule
        </p>
        <p className="mt-3 font-display text-xl">
          {formatTime(diffuser.start_time)} – {formatTime(diffuser.end_time)}
        </p>
        <p className="text-sm text-muted-foreground">{formatDays(diffuser.schedule_days)}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <span
              key={day.value}
              className={`border px-3 py-1 text-xs ${
                diffuser.schedule_days.includes(day.value)
                  ? "border-foreground/60 text-foreground"
                  : "border-border text-muted-foreground/60"
              }`}
            >
              {day.short}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}
