import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Bluetooth, CalendarClock, Star } from "lucide-react";

import pairingVideo from "@/assets/bluetooth-pairing.mov.asset.json";
import { AppHeader } from "@/components/AppHeader";
import { ScheduleGrid } from "@/components/ScheduleGrid";
import { StatusButton, type CircleState } from "@/components/StatusButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WheelPicker } from "@/components/WheelPicker";
import { Label } from "@/components/ui/label";
import {
  pairDiffuser,
  isBluetoothSupported,
  isRealLink,
  sendFrames,
  checkConnection,
} from "@/lib/bluetooth";
import { DevicePicker } from "@/components/DevicePicker";
import {
  ensureBluetoothPermission,
  openAppSettings,
  openLocationSettings,
  type DeviceChooser,
  type NativeDevice,
} from "@/lib/native-ble";

import { trackEvent } from "@/lib/meta";
import { pushName, pushSettings, readSettings } from "@/lib/push";
import { buildSyncTimestamp, validateBroadcastName } from "@/lib/scentlife";
import {
  INTENSITIES,
  PAUSE_SECONDS,
  RUN_SECONDS,
  clampCustomTiming,
  type CustomTiming,
  hardwareName,
  defaultSchedule,
  formatSeconds,
  intensityPreset,
  type DaySchedule,
  type Intensity,
} from "@/lib/diffuser";
import { useDiffuserStore } from "@/stores/diffuserStore";
import { bluetoothRequirementPrompt, useBluetoothRequirements } from "@/hooks/useBluetoothRequirements";

export const Route = createFileRoute("/setup")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { start?: boolean; edit?: string } => ({
    start: search["start"] === true || search["start"] === "true",
    ...(typeof search["edit"] === "string" && search["edit"] ? { edit: search["edit"] } : {}),
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

type Phase = "intro" | "idle" | "pairing" | "paired" | "name" | "intensity" | "pushing" | "schedule";

const STEPS = ["Connect", "Intensity", "Routine"] as const;

const ONBOARDING = [
  { icon: Bluetooth, title: "Connect your diffuser" },
  { icon: Star, title: "Choose your intensity" },
  { icon: CalendarClock, title: "Set your routines" },
] as const;

// Lucide's star has softened points; this path keeps the pikes sharp.
function SharpStar({ className, filled }: { className?: string; filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinejoin="miter"
      strokeMiterlimit={10}
      strokeLinecap="butt"
      aria-hidden
    >
      <path d="M12 1.2 15 8.7 23 9.3 16.9 14.6 18.8 22.8 12 18.3 5.2 22.8 7.1 14.6 1 9.3 9 8.7Z" />
    </svg>
  );
}

function stepIndex(phase: Phase) {
  if (phase === "intensity") return 1;
  if (phase === "schedule") return 2;
  if (phase === "name") return 0;
  return 0;
}

function Steps({ phase }: { phase: Phase }) {
  const current = stepIndex(phase);
  return (
    <div className="mt-4 grid grid-cols-3 gap-4">
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
  const { start, edit } = Route.useSearch();
  const addDiffuser = useDiffuserStore((s) => s.addDiffuser);
  const updateDiffuser = useDiffuserStore((s) => s.updateDiffuser);
  const existingCount = useDiffuserStore((s) => s.diffusers.length);
  // Editing an existing diffuser: skip pairing and naming, start on intensity.
  const editing = useDiffuserStore((s) => s.diffusers.find((d) => d.id === edit) ?? null);

  const [phase, setPhase] = useState<Phase>(editing ? "intensity" : "intro");
  const [fading, setFading] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(editing?.device_id ?? null);
  // The app-side device name is fixed; only the room is user provided.
  const name = DEFAULT_NAME;
  const [room, setRoom] = useState(editing?.room ?? "");
  const [roomTouched, setRoomTouched] = useState(false);
  const [intensity, setIntensity] = useState<Intensity>(editing?.intensity ?? "high");
  const [schedule, setSchedule] = useState<DaySchedule[]>(() => editing?.schedule ?? defaultSchedule());
  const [custom, setCustom] = useState<CustomTiming | null>(editing?.custom_timing ?? null);
  const [explainAdvanced, setExplainAdvanced] = useState(false);
  const [result, setResult] = useState<CircleState>("idle");
  const [error, setError] = useState<string | null>(null);
  const {
    checking: checkingRequirements,
    bluetoothOff: btOff,
    permissionDenied: btDenied,
    locationOff: locOff,
    refresh: refreshRequirements,
    // Editing an existing diffuser still needs Bluetooth on and allowed: the
    // settings can only be saved over a live link.
  } = useBluetoothRequirements(!!editing || phase === "idle");
  const autostarted = useRef(false);
  // In-app Bluetooth chooser (named devices only).
  const [picker, setPicker] = useState<NativeDevice[] | null>(null);
  const pickerResolve = useRef<((device: NativeDevice | null) => void) | null>(null);

  // The store rehydrates from local storage after the first render, so adopt the
  // diffuser's saved settings as soon as it appears.
  const loadedEdit = useRef(false);
  useEffect(() => {
    if (!editing || loadedEdit.current) return;
    loadedEdit.current = true;
    setDeviceId(editing.device_id);
    setRoom(editing.room);
    setIntensity(editing.intensity);
    setCustom(editing.custom_timing ?? null);
    setSchedule(editing.schedule);
    setPhase("intensity");
  }, [editing]);


  async function afterPaired(device: { deviceId: string; suggestedName: string }) {
    setDeviceId(device.deviceId);
    try {
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
      trackEvent("Lead", { content_category: "diffuser_pairing" });
    } catch (err) {
      setPhase("idle");
      toast.error((err as Error).message, { className: "whitespace-pre-line" });
    }
  }

  const chooseDevice: DeviceChooser = (subscribe) =>
    new Promise<NativeDevice | null>((resolve) => {
      pickerResolve.current = resolve;
      setPicker([]);
      subscribe((devices) => setPicker(devices));
    });

  function settlePicker(device: NativeDevice | null) {
    pickerResolve.current?.(device);
    pickerResolve.current = null;
    setPicker(null);
  }

  async function handlePair() {
    // The UI is gated too, but keep the native action itself unreachable until
    // Android has returned every permission and service-state check.
    if (checkingRequirements || btOff || btDenied || locOff) return;
    setError(null);
    setPhase("pairing");
    try {
      const device = await pairDiffuser(chooseDevice);
      await afterPaired(device);
    } catch (err) {
      setPhase("idle");
      toast.error((err as Error).message, { className: "whitespace-pre-line" });
    } finally {
      pickerResolve.current = null;
      setPicker(null);
    }
  }


  // Arriving with ?start=true skips the onboarding and lands straight on the
  // pairing screen. Pairing itself is always started by the user.
  useEffect(() => {
    if (start && !autostarted.current) {
      autostarted.current = true;
      setPhase("intro" === phase ? "idle" : phase);
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
    setError(null);

    // Nothing can be saved without a live link: check the radio, the app's
    // permissions and the actual connection before pretending to send.
    const req = await refreshRequirements();
    if (req.bluetoothOff || req.permissionDenied || req.locationOff) {
      const prompt = bluetoothRequirementPrompt({
        bluetoothOff: req.bluetoothOff,
        permissionDenied: req.permissionDenied,
        locationOff: req.locationOff,
      });
      toast.error(prompt.message, { className: "whitespace-pre-line" });
      return;
    }
    const live = await checkConnection(deviceId);
    if (!live) {
      toast.error("Your diffuser is not connected. Pair it again to change its settings.");
      setDeviceId(null);
      setPhase("idle");
      return;
    }

    setPhase("pushing");
    setResult("pairing");
    try {
      await pushSettings({
        deviceId,
        schedule,
        intensity,
        custom,
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
    <div className="fixed inset-0 flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-background">
      <div className="mx-auto flex w-full max-w-2xl min-h-0 flex-1 flex-col px-11 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
        <div className="z-40 shrink-0 -mx-11 bg-background px-11 pt-[calc(env(safe-area-inset-top)+2rem)] pb-8">
          <AppHeader />
          {editing ? (
            <h1 className="mt-6 font-display text-3xl">{editing.room}'s settings</h1>
          ) : phase === "intro" ? null : (
            <Steps phase={phase} />
          )}
        </div>
        {/* The new step starts behind black, then the veil fades away. Pairing
            reuses the connect screen, so starting a scan does not retrigger it. */}
        <div
          key={`veil-${phase === "pairing" ? "idle" : phase}`}
          className="step-veil pointer-events-none fixed inset-0 z-50 bg-background"
          aria-hidden
        />
        <div
          key={phase === "pairing" ? "idle" : phase}
          className={`flex min-h-0 flex-1 flex-col justify-center overflow-x-hidden overscroll-none ${
            phase === "schedule" ? "overflow-y-auto" : "overflow-y-hidden"
          }`}
        >


        {phase === "intro" && (
          <section className="flex flex-1 flex-col justify-center">
            <h1 className="font-display text-4xl leading-tight">Setup</h1>
            <p className="mt-3 text-sm text-foreground">
              Three short steps and your diffuser runs on its own.
            </p>

            <ol className="mt-9 space-y-5">
              {ONBOARDING.map((item, index) => (
                <li key={item.title} className="flex items-start gap-4">
                  <span className="flex size-12 shrink-0 items-center justify-center border border-gold text-gold">
                    <item.icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 pt-1">
                    <p className="text-xs uppercase tracking-[0.18em] text-gold">
                      Step {index + 1}
                    </p>
                    <p className="mt-1 font-display text-xl leading-tight">{item.title}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-10">
              <StatusButton
                state="idle"
                icon={false}
                label="Start now"
                onClick={() => {
                  setPhase("idle");

                }}
              />
            </div>
          </section>
        )}

        {phase === "paired" && (
          // Same section shell as the intensity and routine steps so the header
          // spacing is identical across every step.
          <section
            className={`mt-4 space-y-6 transition-opacity duration-[3000ms] ${
              fading ? "opacity-0" : "opacity-100"
            }`}
          >
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
          </section>
        )}

        {(phase === "idle" || phase === "pairing") && (
          <section className="mt-4 flex flex-1 flex-col">
            {existingCount > 0 && (
                  <button
                    type="button"
                    onClick={() => navigate({ to: "/" })}
                    className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"

                  >
                    <ArrowLeft className="size-4" aria-hidden />
                    Back
                  </button>
                )}
                <h1 className="font-display text-4xl leading-tight">Pairing</h1>

                <video
                  // Responsive: it shrinks with the screen and never grows past
                  // 38% of the viewport height, so the CTA always stays visible.
                  className="mt-6 w-full flex-1 min-h-0 max-h-[38dvh] object-contain"

                  style={{ borderRadius: "10px" }}
                  src={pairingVideo.url}
                  autoPlay
                  loop
                  muted
                  playsInline
                />

                <p className="mt-3 text-sm text-foreground">
                  Double tap on the diffuser button to enter pairing mode. The LED should be
                  blinking.
                </p>


                {(() => {
                  const blocked =
                    phase === "idle" && (checkingRequirements || btOff || btDenied || locOff);
                  if (!blocked) {
                    return (
                      <div className="mt-7">
                        <StatusButton
                          state={phase === "idle" ? "idle" : "pairing"}
                          label={phase === "idle" ? "Start pairing" : "Pairing"}
                          {...(phase === "idle" ? { onClick: handlePair } : {})}
                        />
                      </div>
                    );
                  }
                  if (checkingRequirements) {
                    return (
                      <div className="mt-7 border border-border p-5">
                        <p className="text-sm text-foreground">Checking Bluetooth and Location access…</p>
                      </div>
                    );
                  }
                  // Pairing is hidden entirely until the phone can actually
                  // scan, and the prompt names only what is missing.
                  const prompt = bluetoothRequirementPrompt({
                    bluetoothOff: btOff,
                    permissionDenied: btDenied,
                    locationOff: locOff,
                  });
                  return (
                    <div
                      className={
                        "mt-7 space-y-3 border p-5 " +
                        (prompt.tone === "destructive" ? "border-destructive" : "border-border")
                      }
                    >
                      <p
                        className={
                          "text-sm " +
                          (prompt.tone === "destructive" ? "text-destructive" : "text-foreground")
                        }
                      >
                        {prompt.message}
                      </p>
                      {prompt.cta ? (
                        <Button
                          variant={prompt.tone === "destructive" ? "destructive" : "link"}
                          onClick={() => {
                            if (prompt.target === "location") {
                              void openLocationSettings();
                              return;
                            }
                            if (prompt.target === "permission") {
                              // Re-trigger the native permission popup. If the
                              // system keeps refusing (permanently denied), the
                              // only way left is the app's settings page.
                              void (async () => {
                                const granted = await ensureBluetoothPermission();
                                const next = await refreshRequirements();
                                if (!granted && next.permissionDenied) {
                                  await openAppSettings();
                                }
                              })();
                              return;
                            }
                            void openAppSettings();
                          }}
                          className="h-auto justify-start p-0 text-sm normal-case tracking-normal underline underline-offset-4"
                        >
                          {prompt.cta}
                        </Button>
                      ) : null}
                    </div>
                  );
                })()}
                {phase === "idle" && !btOff && !locOff && !btDenied && !isBluetoothSupported() && (
                  <p className="mt-5 text-xs text-foreground">
                    This browser doesn't support Bluetooth pairing, so we'll set up a demo connection
                    so you can finish. Use Chrome or the mobile app for a real pairing.
                  </p>
                )}
          </section>
        )}


        {phase === "name" && (
          <section className="mt-4 space-y-6">
            <div>
              <h1 className="font-display text-4xl">Where's it going?</h1>
               <p className="mt-2 text-sm text-foreground">Your diffuser is connected.</p>
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
                // The rename command makes the module restart its Bluetooth
                // advertising, which drops the live link. It is therefore sent
                // at the very end, once the settings have been saved.
                setPhase("intensity");
              }}
            >
              Continue
            </Button>
          </section>
        )}

        {phase === "intensity" && (
          <section className="mt-4 space-y-6">
            <button
              type="button"
              onClick={() =>
                editing ? void navigate({ to: "/" }) : setPhase("name")
              }
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back
            </button>
            <h1 className="font-display text-4xl">How intense?</h1>


            {custom ? (
              <div className="flex gap-4">
                <WheelPicker
                  label="Spray"
                  suffix="s"
                  min={RUN_SECONDS.min}
                  max={RUN_SECONDS.max}
                  step={RUN_SECONDS.step}
                  value={custom.onSeconds}
                  onChange={(onSeconds) => setCustom((c) => ({ ...(c ?? preset), onSeconds }))}
                />
                <WheelPicker
                  label="Pause"
                  suffix="s"
                  min={PAUSE_SECONDS.min}
                  max={PAUSE_SECONDS.max}
                  step={PAUSE_SECONDS.step}
                  value={custom.offSeconds}
                  onChange={(offSeconds) => setCustom((c) => ({ ...(c ?? preset), offSeconds }))}
                />
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-center gap-3">
                  {INTENSITIES.map((option) => {
                    const filled = option.stars <= preset.stars;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={intensity === option.value}
                        aria-label={option.label}
                        onClick={() => setIntensity(option.value)}
                        className="p-1 transition-transform active:scale-95"
                      >
                        <SharpStar
                          className={`size-10 ${filled ? "text-gold" : "text-muted-foreground"}`}
                          filled={filled}
                        />
                      </button>
                    );
                  })}
                </div>
                <p className="mt-4 text-center text-sm uppercase tracking-[0.14em] text-gold">
                  {preset.label}
                </p>
              </div>
            )}


             <p className="text-center text-xs leading-relaxed text-foreground">
              Sprays {formatSeconds(custom ? custom.onSeconds : preset.onSeconds)}, then stops{" "}
              {formatSeconds(custom ? custom.offSeconds : preset.offSeconds)} between sprays.
              <br />
              <br />
              Allow 30 minutes for the room to adapt before judging the strength.
            </p>


            {/* Nothing is written to the hardware yet — everything is pushed
                once the schedule is confirmed. */}
            <StatusButton state="idle" icon={false} label="Next" onClick={() => setPhase("schedule")} />

            {/* Discreet switch between the presets and hand-set durations. */}
            <button
              type="button"
              onClick={() => {
                if (custom) {
                  setCustom(null);
                  return;
                }
                if (localStorage.getItem("brume-advanced-seen") !== "1") {
                  setExplainAdvanced(true);
                  return;
                }
                setCustom(clampCustomTiming({ onSeconds: preset.onSeconds, offSeconds: preset.offSeconds }));
              }}
              className="mx-auto block text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              {custom ? "Back to basic mode" : "Switch to advanced mode"}
            </button>

            <Dialog open={explainAdvanced} onOpenChange={setExplainAdvanced}>
              <DialogContent className="border-border bg-background">
                <DialogHeader>
                  <DialogTitle className="font-display text-2xl">Advanced mode</DialogTitle>
                  <DialogDescription className="text-sm text-foreground">
                    Basic mode uses our ready-made intensities. Advanced mode lets you set your own
                    timing: how long each spray lasts ({RUN_SECONDS.min}–{RUN_SECONDS.max} seconds)
                    and how long the diffuser waits between sprays ({PAUSE_SECONDS.min}–
                    {PAUSE_SECONDS.max} seconds). You can go back to basic mode at any time.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    className="w-full"
                    onClick={() => {
                      localStorage.setItem("brume-advanced-seen", "1");
                      setCustom(
                        clampCustomTiming({
                          onSeconds: preset.onSeconds,
                          offSeconds: preset.offSeconds,
                        }),
                      );
                      setExplainAdvanced(false);
                    }}
                  >
                    Got it
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </section>
        )}

        {phase === "pushing" && (
          <section className="mt-4 border border-border p-7">
            <h1 className="font-display text-4xl">Sending to your diffuser</h1>
             <p className="mt-3 text-sm text-foreground">
              Keep the diffuser nearby. You'll hear it beep to confirm new settings.
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
          <section className="mt-4 space-y-6">
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
            </div>
            <ScheduleGrid
              schedule={schedule}
              onChange={setSchedule}
              showNames={false}
            />

            {simulated && (
               <p className="text-xs text-foreground">
                Demo connection. Commands are logged, not sent to hardware.
              </p>
            )}
            <StatusButton
              state="idle"
              icon={false}
              label="Confirm"
              onClick={() =>
                void push("schedule", () => {
                  if (editing) {
                    updateDiffuser(editing.id, {
                      intensity,
                      custom_timing: custom,
                      schedule,
                      schedule_active: true,
                      last_pushed_at: new Date().toISOString(),
                      last_pushed_intensity: intensity,
                      last_pushed_schedule: schedule,
                    });
                    navigate({ to: "/", replace: true });
                    return;
                  }
                  trackEvent("CompleteRegistration", {
                    content_name: name.trim() || DEFAULT_NAME,
                    content_category: "diffuser_setup",
                  });
                  addDiffuser({
                    name: name.trim() || DEFAULT_NAME,
                    room: room.trim(),
                    device_id: deviceId,
                    intensity,
                    custom_timing: custom,
                    schedule,
                    schedule_active: true,
                    last_pushed_at: new Date().toISOString(),
                    last_pushed_intensity: intensity,
                    last_pushed_schedule: schedule,

                  });
                  navigate({ to: "/", replace: true });
                })
              }
            />
          </section>
        )}
        </div>
      </div>
      {picker && (
        <DevicePicker
          devices={picker}
          onSelect={(device) => settlePicker(device)}
          onCancel={() => settlePicker(null)}
        />
      )}
    </div>

  );
}
