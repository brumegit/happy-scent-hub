import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Bluetooth, CalendarClock, Gauge, Plus } from "lucide-react";
import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  DAYS,
  INTENSITIES,
  fetchMyDiffusers,
  formatDays,
  formatTime,
  type Diffuser,
  type Intensity,
} from "@/lib/diffuser";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "My diffusers — Aura" },
      { name: "description", content: "See your Aura diffuser, its intensity and its active schedule." },
      { property: "og:title", content: "My diffusers — Aura" },
      { property: "og:description", content: "Your diffuser, intensity and active schedule at a glance." },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["diffusers"], queryFn: fetchMyDiffusers });

  useEffect(() => {
    if (!isLoading && data && data.length === 0) {
      navigate({ to: "/setup", replace: true });
    }
  }, [isLoading, data, navigate]);

  return (
    <div className="relative min-h-screen">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--gradient-glow)" }}
        aria-hidden
      />
      <div className="relative mx-auto max-w-3xl px-6 py-8">
        <AppHeader />

        <div className="mt-10 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl">Your diffusers</h1>
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
          {isLoading && <div className="h-52 animate-pulse rounded-3xl border border-border bg-card" />}
          {data?.map((diffuser) => <DiffuserCard key={diffuser.id} diffuser={diffuser} />)}
        </div>
      </div>
    </div>
  );
}

function DiffuserCard({ diffuser }: { diffuser: Diffuser }) {
  const queryClient = useQueryClient();

  const update = useMutation({
    mutationFn: async (patch: Partial<Diffuser>) => {
      const { error } = await supabase.from("diffusers").update(patch).eq("id", diffuser.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["diffusers"] }),
    onError: (error) => toast.error((error as Error).message),
  });

  return (
    <article
      className="rounded-3xl border border-border bg-card p-7"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl">{diffuser.name}</h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-accent">
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
            onCheckedChange={(checked) => update.mutate({ schedule_active: checked })}
          />
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-secondary/30 p-5">
        <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Gauge className="size-4" aria-hidden />
          Intensity
        </p>
        <div className="mt-3 flex gap-2">
          {INTENSITIES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={diffuser.intensity === option.value}
              onClick={() => update.mutate({ intensity: option.value as Intensity })}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm transition-colors ${
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

      <div className="mt-4 rounded-2xl border border-border bg-secondary/30 p-5">
        <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
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
              className={`rounded-full border px-3 py-1 text-xs ${
                diffuser.schedule_days.includes(day.value)
                  ? "border-primary/60 text-primary"
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
