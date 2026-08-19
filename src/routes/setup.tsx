import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

import pairingVideo from "@/assets/bluetooth-pairing.mov.asset.json";
import { AppHeader } from "@/components/AppHeader";
import { GuestBanner } from "@/components/GuestBanner";
import { ScheduleGrid } from "@/components/ScheduleGrid";
import { TimeFormatToggle } from "@/components/TimeFormatToggle";
import { StatusButton, type CircleState } from "@/components/StatusButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pairDiffuser, isBluetoothSupported, isRealLink, sendFrames } from "@/lib/bluetooth";
import { pushName, pushSettings, readSettings } from "@/lib/push";
import { buildSyncTimestamp, validateBroadcastName } from "@/lib/scentlife";
import {
  INTENSITIES,
  hardwareName,
  defaultSchedule,
  formatSeconds,
  intensityPreset,
  type DaySchedule,
  type Intensity,
} from "@/lib/diffuser";
import { useDiffuserStore } from "@/stores/diffuserStore";

export const Route = createFileRoute("/setup")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { start?: boolean } => ({
    start: search["start"] === true || search["start"] === "true",
  }),
  head: () => ({
    meta: [
      { title: "Set up your diffuser | Brume" },
      { name: "description", content: "Pair your Brume diffuser, choose an intensity and paint its weekly schedule." },
      { property: "og:title", content: "Set up your diffuser | Brume" },
      { property: "og:description", content: "Pair, choose an intensity, paint your hours." },
    ],
  }),
  component: Setup,
});

const DEFAULT_NAME = "The 24/7 Room Diffuser";

type Phase = "idle" | "pairing" | "paired" | "name" | "intensity" | "pushing" | "schedule";

const STEPS = ["Connect", "Intensity", "Routine"] as const;

function stepIndex(phase: Phase) {
  if (phase === "intensity") return 1;
  if (phase === "schedule") return 2;
  if (phase === "name") return 0;
  return 0;
}

function Steps({ phase }: { phase: Phase }) {
  const current = stepIndex(phase);
  return (
    <div className="mt-8 grid grid-cols-3 gap-4">
      {STEPS.map((step, index) => (
        <div key={step}>
          <div className={`h-0.5 ${index <= current ? "bg-gold" : "bg-border"}`} />
          <p
            className={`mt-3 text-sm ${index <= current ? "text-foreground" : "text-muted-foreground"}`}
          >
            {step}
          </p>
        </div>
      ))}
    </div>
  );
}

function Setup() {
  const navigate = useNavigate();
  const { start } = Route.useSearch();
  const addDiffuser = useDiffuserStore((s) => s.addDiffuser);
  const existingCount = useDiffuserStore((s) => s.diffusers.length);

  const [phase, setPhase] = useState<Phase>("idle");
  const [fading, setFading] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  // The app-side device name is fixed; only the room is user provided.
  const name = DEFAULT_NAME;
  const [room, setRoom] = useState("");
  const [roomTouched, setRoomTouched] = useState(false);
  const [intensity, setIntensity] = useState<Intensity>("high");
  const [schedule, setSchedule] = useState<DaySchedule[]>(defaultSchedule);
  const [result, setResult] = useState<CircleState>("idle");
  const [error, setError] = useState<string | null>(null);
  const autostarted = useRef(false);

  async function handlePair() {
    setPhase("pairing");
    setError(null);
    try {
      const device = await pairDiffuser({ preferBrume: existingCount === 0 });
      setDeviceId(device.deviceId);
      
      // Only sync the clock on pairing — settings are pushed at each step.
      await sendFrames(device.deviceId, [buildSyncTimestamp()]);
      // Pull the diffuser's live configuration so the selectors start from the
      // hardware's real state instead of app defaults.
      const live = await readSettings(device.deviceId).catch(() => null);
      if (live) {
        setIntensity(live.intensity);
        if (live.schedule.some((d) => d.active)) setSchedule(live.schedule);
      }
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

  // Green "OK" holds, then fades over 3 seconds before naming.
  useEffect(() => {
    if (phase !== "paired") return;
    const fade = setTimeout(() => setFading(true), 900);
    const next = setTimeout(() => {
      setFading(false);
      setPhase("name");
    }, 1400);
    return () => {
      clearTimeout(fade);
      clearTimeout(next);
    };
  }, [phase]);

  async function push(next: Phase, onDone?: () => void) {
    const previous = phase;
    setPhase("pushing");
    setResult("pairing");
    setError(null);
    try {
      await pushSettings({
        deviceId,
        schedule,
        intensity,
        hardwareName: hardwareName(name.trim() || DEFAULT_NAME, room.trim()),
      });
      setResult("success");
      setTimeout(() => {
        setResult("idle");
        setPhase(next);
        onDone?.();
      }, 1400);
    } catch (err) {
      setError((err as Error).message || "Could not reach the diffuser.");
      setResult("error");
      setTimeout(() => {
        setResult("idle");
        setPhase(previous);
      }, 2400);
    }
  }

  const combinedName = hardwareName(name, room.trim());
  // The device name stays in the app only — never broadcast — so it is free
  // form. Only the room name ends up in the Bluetooth label and is validated.
  const roomError = room.trim().length === 0 ? "Enter a room name." : validateBroadcastName(room);
  const combinedError = roomError ? null : validateBroadcastName(combinedName);



  const preset = intensityPreset(intensity);
  const simulated = deviceId !== null && !isRealLink(deviceId);

  return (
    <div className="min-h-screen">
      <GuestBanner />
      <div className="mx-auto max-w-2xl px-6 py-8">
        <AppHeader />
        <Steps phase={phase} />
        <div className="flex min-h-[calc(100vh-18rem)] flex-col justify-center">

        {(phase === "idle" || phase === "pairing" || phase === "paired") && (
          <section
            className={`mt-8 glass p-7 transition-all duration-[3000ms] ${
              phase === "paired"
                ? `border border-transparent ${fading ? "bg-background opacity-0" : "opacity-100"}`
                : "border border-border opacity-100"
            }`}
          >
            {phase === "paired" ? (
              // Once connected, everything else is hidden and only the success
              // animation stays, centered, while the tile fades to black.
              <div className="flex min-h-[18rem] items-center justify-center">
                <div className="w-full space-y-6 text-center">
                  <div className="relative mx-auto size-20">
                    <span className="success-ring" />
                    <span className="success-ring" style={{ animationDelay: "0.7s" }} />
                    <span className="success-pop absolute inset-0 flex items-center justify-center rounded-full border border-emerald-400">
                      <svg
                        className="success-check size-9 text-emerald-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path className="text-emerald-400" stroke="currentColor" d="M5 12.5 10 17.5 19 7" />
                      </svg>
                    </span>
                  </div>
                  <p className="success-pop text-center text-sm text-emerald-400">
                    Diffuser paired successfully
                  </p>
                </div>
              </div>
            ) : (
              <>
                {existingCount > 0 && (
                  <button
                    type="button"
                    onClick={() => navigate({ to: "/home" })}
                    className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="size-4" aria-hidden />
                    Back
                  </button>
                )}
                <h1 className="font-display text-4xl leading-tight">Start pairing</h1>

                <video
                  // Cropped from the top (gravity north) so the frame keeps its
                  // size instead of shrinking on short screens.
                  className="mx-auto my-8 w-4/5 h-[clamp(8rem,calc(100vh-24rem),26rem)] object-cover object-top"
                  style={{ borderRadius: "10px" }}
                  src={pairingVideo.url}
                  autoPlay
                  loop
                  muted
                  playsInline
                />

                <p className="mt-3 text-sm text-muted-foreground">
                  Double tap on the diffuser button to enter pairing mode. The LED should be
                  blinking.
                </p>


                <div className="mt-7">
                  <StatusButton
                    state={phase === "idle" ? "idle" : "pairing"}
                    label={phase === "idle" ? "Start pairing" : "Searching"}
                    {...(phase === "idle" ? { onClick: handlePair } : {})}
                  />
                </div>

                {phase === "idle" && !isBluetoothSupported() && (
                  <p className="mt-5 text-xs text-muted-foreground">
                    This browser doesn't support Bluetooth pairing, so we'll set up a demo connection
                    so you can finish. Use Chrome or the mobile app for a real pairing.
                  </p>
                )}
              </>
            )}
          </section>
        )}

        {phase === "name" && (
          <section className="mt-8 space-y-6 border border-border glass p-7 animate-fade-in">
            <div>
              <h1 className="font-display text-4xl">Where's it going?</h1>
              <p className="mt-2 text-sm text-muted-foreground">Your diffuser is connected.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="room">Room name</Label>
              <Input
                id="room"
                value={room}
                placeholder="Lounge"
                onChange={(e) => setRoom(e.target.value)}
              />
              {/* Only surfaced once the user tries to continue — never up front. */}
              {roomTouched && roomError && (
                <p className="text-xs text-destructive">{roomError}</p>
              )}
            </div>
            {roomTouched && combinedError && (
              <p className="text-xs text-destructive">{combinedError}</p>
            )}
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                if (roomError || combinedError) {
                  setRoomTouched(true);
                  return;
                }
                // Renaming is its own single hardware command. Keeping it out
                // of the settings push prevents several beeps on Confirm.
                void pushName(deviceId, hardwareName(name.trim() || DEFAULT_NAME, room.trim()))
                  .catch(() => undefined)
                  .finally(() => setPhase("intensity"));
              }}
            >
              Continue
            </Button>
          </section>
        )}

        {phase === "intensity" && (
          <section className="mt-8 space-y-6 border border-border glass p-7 animate-fade-in">
            <button
              type="button"
              onClick={() => setPhase("name")}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back
            </button>
            <h1 className="font-display text-4xl">How intense?</h1>


            <div className="grid grid-cols-3 gap-2">
              {INTENSITIES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={intensity === option.value}
                  onClick={() => setIntensity(option.value)}
                  className={`w-full border bg-background px-2 py-4 text-center text-sm uppercase tracking-[0.14em] transition-colors ${
                    intensity === option.value
                      ? "border-gold text-gold"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              Sprays {formatSeconds(preset.onSeconds)}, then stops {formatSeconds(preset.offSeconds)}{" "}
              between sprays.
              <br />
              Allow 30 minutes for the room to adapt before judging the strength.
            </p>

            {/* Nothing is written to the hardware yet — everything is pushed
                once the schedule is confirmed. */}
            <StatusButton state="idle" icon={false} label="Next" onClick={() => setPhase("schedule")} />
          </section>
        )}

        {phase === "pushing" && (
          <section className="mt-8 border border-border glass p-7">
            <h1 className="font-display text-4xl">Sending to your diffuser</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Keep the diffuser nearby. It beeps once each command is accepted.
            </p>
            <div className="mt-7">
              <StatusButton
                state={result === "idle" ? "pairing" : result}
                icon={result !== "pairing"}
                label={result === "success" ? "OK" : result === "error" ? "Error" : "Sending"}
              />
            </div>
            {result === "error" && error && (
              <p className="mt-4 text-sm text-destructive">{error}</p>
            )}
          </section>
        )}

        {phase === "schedule" && (
          <section className="mt-8 space-y-6 animate-fade-in">
            <div>
              <button
                type="button"
                onClick={() => {
                setPhase("intensity");
              }}
                className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-4" aria-hidden />
                Back
              </button>
              <h1 className="font-display text-4xl">When?</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Start about 30 minutes early to fill the room.
              </p>

            </div>
            <ScheduleGrid
              schedule={schedule}
              onChange={setSchedule}
              showNames={false}
              showTimeFormat={false}
            />

            {simulated && (
              <p className="text-xs text-muted-foreground">
                Demo connection. Commands are logged, not sent to hardware.
              </p>
            )}
            <StatusButton
              state="idle"
              icon={false}
              label="Confirm"
              onClick={() =>
                void push("schedule", () => {
                  addDiffuser({
                    name: name.trim() || DEFAULT_NAME,
                    room: room.trim(),
                    device_id: deviceId,
                    intensity,
                    schedule,
                    schedule_active: true,
                    last_pushed_at: new Date().toISOString(),
                    last_pushed_intensity: intensity,
                    last_pushed_schedule: schedule,

                  });
                  navigate({ to: "/home", replace: true });
                })
              }
            />
            <div className="sticky bottom-[5.25rem] z-40 bg-background">
              <TimeFormatToggle />
            </div>
          </section>
        )}
        </div>
      </div>
    </div>
  );
}
