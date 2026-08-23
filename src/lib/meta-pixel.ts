// Client-side Meta Pixel loader and helpers.
// The Pixel runs inside the Capacitor webview exactly like on a website —
// no native SDK needed. All functions are SSR-safe (guarded by typeof window).

const PIXEL_ID = import.meta.env["VITE_META_PIXEL_ID"] as string | undefined;

let initialized = false;

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & {
      callMethod?: (...args: unknown[]) => void;
      queue?: unknown[];
      loaded?: boolean;
      version?: string;
      push?: (...args: unknown[]) => void;
    };
    _fbq?: unknown;
  }
}

/**
 * Loads the Meta Pixel base script and fires the initial PageView.
 * Safe to call multiple times — only loads once.
 */
export function initPixel(): void {
  if (typeof window === "undefined" || initialized || !PIXEL_ID) return;
  initialized = true;

  // Standard Meta Pixel base code, adapted for TypeScript.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  (function (f: Window, b: Document, e: string, v: string) {
    if (f.fbq) return;
    const n: any = (f.fbq = function () {
      n.callMethod
        ? n.callMethod.apply(n, arguments)
        : n.queue.push(arguments);
    });
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    const t = b.createElement(e) as HTMLScriptElement;
    t.async = true;
    t.src = v;
    const s = b.getElementsByTagName(e)[0];
    s?.parentNode?.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable @typescript-eslint/no-explicit-any */

  window.fbq?.("init", PIXEL_ID);
  window.fbq?.("track", "PageView");
}

/** Fire a standard Meta Pixel event (e.g. "Lead", "CompleteRegistration"). */
export function pixelTrack(
  eventName: string,
  data?: Record<string, unknown>,
  eventId?: string,
): void {
  if (typeof window === "undefined" || !window.fbq) return;
  const opts = eventId ? { eventID: eventId } : undefined;
  window.fbq("track", eventName, data ?? {}, opts);
}

/** Fire a custom (non-standard) Meta Pixel event (e.g. "AppOpen"). */
export function pixelTrackCustom(
  eventName: string,
  data?: Record<string, unknown>,
  eventId?: string,
): void {
  if (typeof window === "undefined" || !window.fbq) return;
  const opts = eventId ? { eventID: eventId } : undefined;
  window.fbq("trackCustom", eventName, data ?? {}, opts);
}

/** Read the _fbp cookie value set by the Pixel, for CAPI user matching. */
export function getFbp(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(/(?:^|;\s*)_fbp=([^;]+)/);
  return match?.[1] ?? undefined;
}

/** Read the _fbc cookie value (set when arriving via a Meta ad click). */
export function getFbc(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(/(?:^|;\s*)_fbc=([^;]+)/);
  return match?.[1] ?? undefined;
}

/**
 * Generate a fallback fbp value if the Pixel hasn't set the cookie yet.
 * Format: fb.1.{timestamp}.{random} — matches Meta's _fbp cookie format.
 */
export function generateFbp(): string {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 1_000_000_000);
  return `fb.1.${ts}.${rand}`;
}
