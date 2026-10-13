// Unified app analytics: every event goes to Meta (Pixel + CAPI) and Bird
// under the SAME event name. Once an email is declared it rides along on
// every Meta event (hashed server-side, advanced matching client-side) and
// identifies the Bird contact via the "emailaddress" identifier key.

import { getContactEmail } from "./customer-identity";
import { trackEvent, setMetaUserEmail } from "./meta";

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

const DECLARED_KEY = "brume-email-declared-sent";

function withBird(fn: (bird: BirdLike) => void, attempt = 0): void {
  if (typeof window === "undefined") return;
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
  birdTrack(name, {
    ...(email ? { emailaddress: email } : {}),
    page: window.location.pathname,
    app_platform: appPlatform(),
    at: new Date().toISOString(),
    ...opts.bird,
  });
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
