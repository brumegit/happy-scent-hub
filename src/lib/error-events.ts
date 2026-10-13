// Error event fan-out for analytics tools. Fire-and-forget, never throws.
// - Bird: full debug context (same trace as the in-app debug log: taps,
//   screens, every command sent to the diffuser, push step statuses).
// - Meta: a bare "AppError" custom event with no payload.

import { fullTrace } from "./ble-log";
import { pushDebug } from "@/stores/pushDebugStore";
import { getContactEmail } from "./customer-identity";
import { trackEvent } from "./meta";

type BirdLike = {
  tracker?: {
    track?: (name: string, props?: Record<string, unknown>) => unknown;
    web?: { track?: (name: string, props?: Record<string, unknown>) => unknown };
  };
};

function birdTrack(name: string, props: Record<string, unknown>): void {
  const bird = (window as unknown as { Bird?: BirdLike }).Bird;
  const fn = bird?.tracker?.track ?? bird?.tracker?.web?.track;
  if (!fn) return;
  try {
    void Promise.resolve(fn.call(bird?.tracker, name, props)).catch(() => {});
  } catch {
    // Tracking must never break the app.
  }
}

export function reportErrorEvent(input: {
  kind: string;
  message: string;
  room?: string | undefined;
  context?: string | undefined;
}): void {
  if (typeof window === "undefined") return;
  try {
    const debug = pushDebug();
    const steps = Object.fromEntries(
      Object.entries(debug.steps).map(([k, v]) => [k, v.detail ? `${v.status}: ${v.detail}` : v.status]),
    );
    birdTrack("app_error", {
      kind: input.kind,
      message: input.message,
      room: input.room ?? null,
      context: input.context ?? null,
      email: getContactEmail() ?? null,
      page: window.location.pathname + window.location.search,
      userAgent: navigator.userAgent,
      linkError: debug.linkError,
      pushSteps: steps,
      pushStartedAt: debug.startedAt,
      log: fullTrace().slice(-200).join("\n"),
      at: new Date().toISOString(),
    });
  } catch {
    // ignore
  }
  try {
    trackEvent("AppError", undefined, true);
  } catch {
    // ignore
  }
}
