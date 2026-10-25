// Unified app analytics: every event goes to Meta (Pixel + CAPI) and Bird
// under the SAME event name. Once an email is declared it rides along on
// every Meta event (hashed server-side, advanced matching client-side) and
// identifies the Bird contact via the "emailaddress" identifier key.

import { getContactEmail } from "./customer-identity";
import { trackEvent, setMetaUserEmail } from "./meta";
import { isBirdPlatformAllowed } from "./bird-policy";

type BirdLike = {
  tracker?: {
    track?: (name: string, props?: Record<string, unknown>) => unknown;
    web?: { track?: (name: string, props?: Record<string, unknown>) => unknown };
  };
  contact?: {
    identify?: (input: {
      strategy: string;
      identifier: { key: string; value: string };
    }) => unknown;
  };
};

/** "ios" | "android" in the store apps, "web" in a browser. */
function appPlatform(): string {
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  return cap?.getPlatform?.() ?? "web";
}

// Google Analytics 4 (Firebase-linked) web stream. Empty = GA disabled.
export const GA_MEASUREMENT_ID = "G-TV4WC1BP9F";

type GtagWindow = { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };

export function initGoogleAnalytics(): void {
  if (typeof window === "undefined" || !GA_MEASUREMENT_ID) return;
  const w = window as unknown as GtagWindow;
  if (w.gtag) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(s);
  w.dataLayer = w.dataLayer || [];
  w.gtag = function () {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments);
  };
  w.gtag("js", new Date());
  w.gtag("config", GA_MEASUREMENT_ID, { app_platform: appPlatform() });
}

function gaTrack(name: string, props: Record<string, unknown>): void {
  const w = window as unknown as GtagWindow;
  if (!GA_MEASUREMENT_ID || !w.gtag) return;
  // GA params must be short scalars; drop long logs and the raw email.
  const clean: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) {
    if (k === "emailaddress" || k === "log") continue;
    if (typeof v === "number" || typeof v === "boolean") clean[k] = v;
    else if (typeof v === "string") clean[k] = v.slice(0, 100);
  }
  try {
    w.gtag("event", name, clean);
  } catch {
    // ignore
  }
}

const DECLARED_KEY = "brume-email-declared-sent";

/** Load Bird only after confirming an installed mobile app environment. */
export function initBird(): void {
  if (typeof window === "undefined" || !isBirdPlatformAllowed(appPlatform())) return;
  if (document.getElementById("brume-bird-sdk")) return;
  const script = document.createElement("script");
  script.id = "brume-bird-sdk";
  script.src = "https://embeddables.p.mbirdcdn.net/sdk/v0/bird-sdk.js";
  script.dataset.configUrl = "https://api.bird.com/workspaces/69097a3b-f975-4e02-953e-7ed544b6d2b8/applications/2edfaee8-dfab-450a-8f66-033dd4e450b8/signature/2024-06-17T17-12-51_1664b9167f";
  script.defer = true;
  document.head.appendChild(script);
}

function withBird(fn: (bird: BirdLike) => void, attempt = 0): void {
  if (typeof window === "undefined" || !isBirdPlatformAllowed(appPlatform())) return;
  const bird = (window as unknown as { Bird?: BirdLike }).Bird;
  if (bird?.tracker || bird?.contact) {
    try {
      fn(bird);
    } catch {
      // Tracking must never break the app.
    }
    return;
  }
  // The Bird SDK loads deferred; retry for ~10s before giving up.
  if (attempt < 20) setTimeout(() => withBird(fn, attempt + 1), 500);
}

function birdIdentify(email: string): void {
  withBird((bird) => {
    void Promise.resolve(
      bird.contact?.identify?.({
        strategy: "Visitor",
        identifier: { key: "emailaddress", value: email },
      }),
    ).catch(() => {});
  });
}

function birdTrack(name: string, props: Record<string, unknown>): void {
  withBird((bird) => {
    const fn = bird.tracker?.track ?? bird.tracker?.web?.track;
    if (!fn) return;
    void Promise.resolve(fn.call(bird.tracker, name, props)).catch(() => {});
  });
}

/**
 * Send one event to Meta and Bird with the same name.
 * `meta` stays light (Meta ignores most custom data); `bird` is the detailed payload.
 */
export function track(
  name: string,
  opts: { meta?: Record<string, unknown>; bird?: Record<string, unknown> } = {},
): void {
  if (typeof window === "undefined") return;
  const email = getContactEmail();
  try {
    trackEvent(name, { app_platform: appPlatform(), ...opts.meta }, true);
  } catch {
    // ignore
  }
  const birdProps = {
    ...(email ? { emailaddress: email } : {}),
    page: window.location.pathname,
    app_platform: appPlatform(),
    at: new Date().toISOString(),
    ...opts.bird,
  };
  birdTrack(name, birdProps);
  gaTrack(name, birdProps);
}

/** Re-attach a known email on app open so returning users stay enriched. */
export function identifyKnownUser(): void {
  const email = getContactEmail();
  if (!email) return;
  setMetaUserEmail(email);
  birdIdentify(email);
}

/**
 * Call right after an email is saved. Identifies the user on both platforms,
 * then fires AppEmailDeclared every time so Bird keeps the latest email.
 * `first_declaration` is true only the first time on this device, for the declared rate.
 */
export function declareEmail(source: string): void {
  const email = getContactEmail();
  if (!email) return;
  setMetaUserEmail(email);
  birdIdentify(email);
  let first = true;
  try {
    first = !localStorage.getItem(DECLARED_KEY);
    localStorage.setItem(DECLARED_KEY, email);
  } catch {
    // ignore
  }
  track("AppEmailDeclared", {
    meta: { first_declaration: first },
    bird: { source, first_declaration: first },
  });
}
