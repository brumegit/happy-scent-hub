import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Bluetooth, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { pairDiffuser, isBluetoothSupported } from "@/lib/bluetooth";
import { DAYS, INTENSITIES, type Intensity } from "@/lib/diffuser";

export const Route = createFileRoute("/_authenticated/setup")({
  head: () => ({
    meta: [
      { title: "Set up your diffuser — Aura" },
      { name: "description", content: "Pair your Aura diffuser, choose an intensity and set its schedule." },
      { property: "og:title", content: "Set up your diffuser — Aura" },
      { property: "og:description", content: "Three quick steps to get your Aura diffuser running." },
    ],
  }),
  component: Setup,
});

const STEP_LABELS = ["Connect", "Intensity", "Schedule"];

function Setup() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [pairing, setPairing] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [intensity, setIntensity] = useState<Intensity>("medium");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("20:00");

  async function handlePair() {
    setPairing(true);
    try {
      const device = await pairDiffuser();
      setDeviceId(device.deviceId);
      setName((current) => current || device.suggestedName);
      toast.success("Diffuser connected");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPairing(false);
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("You need to be signed in.");
      const { error } = await supabase.from("diffusers").insert({
        user_id: userId,
        name: name.trim(),
        device_id: deviceId,
        intensity,
        schedule_days: days,
        start_time: startTime,
        end_time: endTime,
        schedule_active: true,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["diffusers"] });
      toast.success("Your diffuser is ready");
      navigate({ to: "/home", replace: true });
    },
    onError: (error) => toast.error((error as Error).message),
  });

  function toggleDay(value: number) {
    setDays((current) =>
      current.includes(value) ? current.filter((d) => d !== value) : [...current, value],
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <AppHeader />

        <div className="mt-10 flex items-center gap-3">
          {STEP_LABELS.map((label, index) => (
            <div key={label} className="flex flex-1 flex-col gap-2">
              <div
                className={`h-1 rounded-full ${index <= step ? "bg-primary" : "bg-muted"}`}
                aria-hidden
              />
              <span
                className={`text-xs ${index <= step ? "text-primary" : "text-muted-foreground"}`}
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        <div
          className="mt-8 rounded-3xl border border-border bg-card p-8"
          style={{ boxShadow: "var(--shadow-soft)" }}
        >
          {step === 0 && (
            <section className="space-y-6">
              <div>
                <h1 className="text-2xl">Connect your diffuser</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Turn your Aura on, hold the button until the light pulses, then pair over Bluetooth.
                </p>
              </div>

              <Button onClick={handlePair} disabled={pairing} size="lg" className="w-full">
                {pairing ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Bluetooth className="size-4" aria-hidden />
                )}
                {deviceId ? "Pair a different device" : "Scan for my diffuser"}
              </Button>

              {!isBluetoothSupported() && (
                <p className="text-xs text-muted-foreground">
                  This browser doesn't support Bluetooth pairing — we'll set up a demo connection so you can
                  finish. Use Chrome or the Aura mobile app for a real pairing.
                </p>
              )}

              {deviceId && (
                <div className="space-y-4 rounded-2xl border border-border bg-secondary/40 p-5">
                  <p className="flex items-center gap-2 text-sm text-accent">
                    <Check className="size-4" aria-hidden />
                    Device found
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="name">Name your diffuser</Label>
                    <Input
                      id="name"
                      placeholder="Living Room"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                </div>
              )}

              <Button
                size="lg"
                className="w-full"
                disabled={!deviceId || name.trim().length === 0}
                onClick={() => setStep(1)}
              >
                Continue
              </Button>
            </section>
          )}

          {step === 1 && (
            <section className="space-y-6">
              <div>
                <h1 className="text-2xl">Choose your intensity</h1>
                <p className="mt-2 text-sm text-muted-foreground">You can change this at any time.</p>
              </div>

              <div className="space-y-3">
                {INTENSITIES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setIntensity(option.value)}
                    className={`w-full rounded-2xl border p-5 text-left transition-colors ${
                      intensity === option.value
                        ? "border-primary bg-secondary/60"
                        : "border-border hover:bg-secondary/30"
                    }`}
                  >
                    <span className="flex items-center justify-between">
                      <span className="font-semibold">{option.label}</span>
                      {intensity === option.value && <Check className="size-4 text-primary" aria-hidden />}
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">{option.blurb}</span>
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" size="lg" className="flex-1" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button size="lg" className="flex-1" onClick={() => setStep(2)}>
                  Continue
                </Button>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="space-y-6">
              <div>
                <h1 className="text-2xl">Set your schedule</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Pick the days and the hours your diffuser should run.
                </p>
              </div>

              <div className="space-y-3">
                <Label>Days</Label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((day) => (
                    <button
                      key={day.value}
                      type="button"
                      aria-pressed={days.includes(day.value)}
                      onClick={() => toggleDay(day.value)}
                      className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                        days.includes(day.value)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:bg-secondary/40"
                      }`}
                    >
                      {day.short}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start">Starts</Label>
                  <Input
                    id="start"
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end">Ends</Label>
                  <Input
                    id="end"
                    type="time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" size="lg" className="flex-1" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button
                  size="lg"
                  className="flex-1"
                  disabled={days.length === 0 || save.isPending}
                  onClick={() => save.mutate()}
                >
                  {save.isPending ? "Saving…" : "Finish setup"}
                </Button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
