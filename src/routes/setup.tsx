import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";
import { GuestBanner } from "@/components/GuestBanner";
import { ScheduleGrid } from "@/components/ScheduleGrid";
import { StatusCircle, type CircleState } from "@/components/StatusCircle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pairDiffuser, isBluetoothSupported, sendFrames } from "@/lib/bluetooth";
import {
  INTENSITIES,
  buildScheduleFrame,
  defaultSchedule,
  formatSeconds,
  intensityPreset,
  type DaySchedule,
  type Intensity,
} from "@/lib/diffuser";
import { buildPower, buildSyncTimestamp } from "@/lib/scentlife";
import { useDiffuserStore } from "@/stores/diffuserStore";

export const Route = createFileRoute("/setup")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({ start: search.start === true || search.start === "true" }),
  head: () => ({
    meta: [
      { title: "Set up your diffuser — Brume" },
      { name: "description", content: "Pair your Brume diffuser, choose an intensity and paint its weekly schedule." },
      { property: "og:title", content: "Set up your diffuser — Brume" },
      { property: "og:description", content: "Pair, choose an intensity, paint your hours." },
    ],
  }),
  component: Setup,
});

const DEFAULT_NAME = "The 24/7 Room Diffuser";

type Phase = "idle" | "pairing" | "paired" | "name" | "intensity" | "pushing" | "schedule";

function Setup() {
  const navigate = useNavigate();
  const { start } = Route.useSearch();
  const addDiffuser = useDiffuserStore((s) => s.addDiffuser);

  const [phase, setPhase] = useState<Phase>("idle");
  const [fading, setFading] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [name, setName] = useState(DEFAULT_NAME);
  const [intensity, setIntensity] = useState<Intensity>("medium");
  const [schedule, setSchedule] = useState<DaySchedule[]>(defaultSchedule);
  const [result, setResult] = useState<CircleState>("idle");
  const [error, setError] = useState<string | null>(null);
  const autostarted = useRef(false);

  async function handlePair() {
    setPhase("pairing");
    setError(null);
    try {
      const device = await pairDiffuser();
      setDeviceId(device.deviceId);
      setName(device.suggestedName || DEFAULT_NAME);
      await sendFrames(device.deviceId, [buildSyncTimestamp(), buildPower(true)]);
      setPhase("paired");
    } catch (err) {
      setPhase("idle");
      toast.error((err as Error).message);
    }
  }

  useEffect(() => {
    if (start && !autostarted.current) {
      autostarted.current = true;
      void handlePair();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  // Green "OK" returns to the middle, then fades over 3 seconds.
  useEffect(() => {
    if (phase !== "paired") return;
    const fade = setTimeout(() => setFading(true), 900);
    const next = setTimeout(() => {
      setFading(false);
      setPhase("name");
    }, 3900);
    return () => {
      clearTimeout(fade);
      clearTimeout(next);
    };
  }, [phase]);

  async function confirmIntensity() {
    setPhase("pushing");
    setResult("idle");
    try {
      await sendFrames(deviceId, [buildScheduleFrame(schedule, intensity)]);
      setResult("success");
      setTimeout(() => {
        setResult("idle");
        setPhase("schedule");
      }, 1400);
    } catch (err) {
      setError((err as Error).message || "Could not reach the diffuser.");
      setResult("error");
      setTimeout(() => {
        setResult("idle");
        setPhase("intensity");
      }, 2200);
    }
  }

  async function confirmSchedule() {
    setPhase("pushing");
    setResult("idle");
    try {
      await sendFrames(deviceId, [buildSyncTimestamp(), buildScheduleFrame(schedule, intensity)]);
      setResult("success");
      setTimeout(() => {
        addDiffuser({
          name: name.trim() || DEFAULT_NAME,
          device_id: deviceId,
          intensity,
          schedule,
          schedule_active: true,
        });
        navigate({ to: "/home", replace: true });
      }, 1400);
    } catch (err) {
      setError((err as Error).message || "Could not reach the diffuser.");
      setResult("error");
      setTimeout(() => {
        setResult("idle");
        setPhase("schedule");
      }, 2400);
    }
  }

  const preset = intensityPreset(intensity);

  return (
    <div className="min-h-screen">
      <GuestBanner />
      <div className="mx-auto max-w-2xl px-6 py-8">
        <AppHeader />

        {(phase === "idle" || phase === "pairing" || phase === "paired") && (
          <section className="mt-10">
            <StatusCircle
              state={phase === "idle" ? "idle" : phase === "pairing" ? "pairing" : "success"}
              label={phase === "idle" ? "Start now" : phase === "pairing" ? "Pairing" : "OK"}
              position={phase === "pairing" ? "top" : "center"}
              fading={fading}
              {...(phase === "idle" ? { onClick: handlePair } : {})}
            />

            {phase === "pairing" && (
              <p className="mt-10 text-center text-sm text-muted-foreground">
                Double tap on the diffuser button to enter pairing mode. The LED should be blinking
                in blue.
              </p>
            )}

            {phase === "idle" && !isBluetoothSupported() && (
              <p className="mt-6 text-center text-xs text-muted-foreground">
                This browser doesn't support Bluetooth pairing — we'll set up a demo connection so
                you can finish. Use Chrome or the mobile app for a real pairing.
              </p>
            )}
          </section>
        )}

        {phase === "name" && (
          <section className="mt-10 space-y-6 border border-border bg-card p-8 animate-fade-in">
            <div>
              <h1 className="font-display text-3xl uppercase">Name your diffuser</h1>
              <p className="mt-2 text-sm text-muted-foreground">Your diffuser is connected.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Device name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button size="lg" className="w-full" onClick={() => setPhase("intensity")}>
              Continue
            </Button>
          </section>
        )}

        {phase === "intensity" && (
          <section className="mt-10 space-y-6 border border-border bg-card p-8 animate-fade-in">
            <h1 className="font-display text-3xl uppercase">Choose your intensity</h1>

            <div className="space-y-3">
              {INTENSITIES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={intensity === option.value}
                  onClick={() => setIntensity(option.value)}
                  className={`w-full border p-5 text-left transition-colors ${
                    intensity === option.value
                      ? "border-primary bg-secondary/60"
                      : "border-border hover:bg-secondary/30"
                  }`}
                >
                  <span className="font-semibold uppercase tracking-[0.14em]">{option.label}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{option.blurb}</span>
                  <span className="mt-2 block text-xs text-muted-foreground">
                    Spray {formatSeconds(option.onSeconds)} · Pause{" "}
                    {formatSeconds(option.offSeconds)}
                  </span>
                </button>
              ))}
            </div>

            <p className="border border-border bg-secondary/30 p-4 text-xs text-muted-foreground">
              Selected: spray {formatSeconds(preset.onSeconds)}, then stop{" "}
              {formatSeconds(preset.offSeconds)} between sprays. Allow 30 minutes for the room to
              adapt before judging the strength.
            </p>

            <Button size="lg" className="w-full" onClick={confirmIntensity}>
              Send to diffuser
            </Button>
          </section>
        )}

        {phase === "pushing" && (
          <section className="mt-10">
            <StatusCircle
              state={result === "idle" ? "pairing" : result}
              label={result === "success" ? "OK" : result === "error" ? "Error" : "Sending"}
            />
            {result === "error" && error && (
              <p className="text-center text-sm text-destructive">{error}</p>
            )}
          </section>
        )}

        {phase === "schedule" && (
          <section className="mt-10 space-y-6 animate-fade-in">
            <div>
              <h1 className="font-display text-3xl uppercase">Your schedule</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Pick the days, then paint the working hours.
              </p>
            </div>
            <ScheduleGrid schedule={schedule} onChange={setSchedule} />
            <Button size="lg" className="w-full" onClick={confirmSchedule}>
              Confirm and send to diffuser
            </Button>
          </section>
        )}
      </div>
    </div>
  );
}
