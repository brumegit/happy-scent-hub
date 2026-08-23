// Client-side Meta event tracking with Pixel + CAPI deduplication.
//
// trackEvent() fires the event on BOTH the client-side Pixel and the
// server-side Conversions API, using the same event_id. Meta deduplicates
// them, giving reliable coverage even when ad blockers kill the Pixel.
//
// Usage:
//   trackEvent("Lead", { content_category: "diffuser_pairing" });
//   trackEvent("AppOpen", { source: "webview" }, true); // true = custom event

import { trackMetaEvent } from "./meta.functions";
import {
  initPixel,
  pixelTrack,
  pixelTrackCustom,
  getFbp,
  getFbc,
  generateFbp,
} from "./meta-pixel";
import { getIdentityEmail } from "@/stores/identityStore";

let pixelReady = false;

/** Ensure the Pixel base code is loaded before firing events. */
function ensurePixelInit(): void {
  if (pixelReady) return;
  pixelReady = true;
  initPixel();
}

/**
 * Track a Meta event with client-side Pixel + server-side CAPI deduplication.
 *
 * @param eventName - Standard Meta event name (e.g. "Lead", "CompleteRegistration") or custom name
 * @param data - Custom data payload attached to the event
 * @param isCustom - If true, fires as a custom event (trackCustom) instead of a standard event (track)
 */
export function trackEvent(
  eventName: string,
  data?: Record<string, unknown>,
  isCustom?: boolean,
): void {
  if (typeof window === "undefined") return;

  ensurePixelInit();

  // Shared event_id for deduplication between Pixel and CAPI.
  const eventId = crypto.randomUUID();

  // 1. Client-side Pixel
  if (isCustom) {
    pixelTrackCustom(eventName, data, eventId);
  } else {
    pixelTrack(eventName, data, eventId);
  }

  // 2. Server-side CAPI (fire-and-forget, never blocks the UI)
  const email = getIdentityEmail();
  const fbp = getFbp() ?? generateFbp();
  const fbc = getFbc() ?? undefined;
  const eventSourceUrl = window.location.href;

  void trackMetaEvent({
    data: {
      eventName,
      eventId,
      customData: data,
      email,
      fbp,
      fbc,
      eventSourceUrl,
    },
  }).catch(() => {
    // Tracking failures must never break the app.
  });
}

/** Initialise the Pixel (loads base code + fires initial PageView). */
export function initMetaPixel(): void {
  ensurePixelInit();
}
