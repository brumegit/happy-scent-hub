// Error event fan-out for analytics tools. Fire-and-forget, never throws.
// - Bird: full debug context (same trace as the in-app debug log: taps,
//   screens, every command sent to the diffuser, push step statuses).
// - Meta: a bare "AppError" custom event with no payload.

import { fullTrace } from "./ble-log";
import { getHotjarUserId } from "./hotjar";
import { pushDebug } from "@/stores/pushDebugStore";
import { track } from "./analytics";

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
    track("AppError", { bird: {
      kind: input.kind,
      message: input.message,
      room: input.room ?? "",
      context: input.context ?? "",
      page: window.location.pathname + window.location.search,
      userAgent: navigator.userAgent,
      linkError: debug.linkError ? String(debug.linkError) : "",
      pushSteps: JSON.stringify(steps),
      pushStartedAt: debug.startedAt ? String(debug.startedAt) : "",
      hotjarUserId: getHotjarUserId() ?? "",
      log: fullTrace().slice(-200).join("\n").slice(-30000),
    } });
  } catch {
    // ignore
  }
}
