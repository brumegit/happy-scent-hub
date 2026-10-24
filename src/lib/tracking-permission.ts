import { Capacitor, registerPlugin } from "@capacitor/core";
import { regionAllowsTracking, shouldRequestTracking, trackingAllowed, TRACKING_NOTICE_VERSION, type TrackingStatus } from "./tracking-policy";

const ATT = registerPlugin<{ status(): Promise<{ status: TrackingStatus }>; request(): Promise<{ status: TrackingStatus }> }>("ATT");
let status: TrackingStatus = "unknown";
let region: string | undefined;
let initialized: Promise<void> | undefined;
let requestPending = false;
const listeners = new Set<() => void>();
const EVIDENCE_KEY = "brume-tracking-choice";

function changed() { listeners.forEach((listener) => listener()); }

export function canTrackAdvertising(): boolean {
  return typeof window !== "undefined" && trackingAllowed(Capacitor.getPlatform(), status, region);
}

export function advertisingEvidence() {
  if (!canTrackAdvertising()) return undefined;
  return { platform: Capacitor.getPlatform(), status, region, noticeVersion: TRACKING_NOTICE_VERSION };
}

export function canShareMatchingEmail(): boolean {
  if (!canTrackAdvertising() || status !== "authorized") return false;
  try {
    const record = JSON.parse(localStorage.getItem(EVIDENCE_KEY) ?? "null");
    return record?.status === "authorized" && record?.noticeVersion === TRACKING_NOTICE_VERSION;
  } catch { return false; }
}

async function refreshStatus() {
  if (Capacitor.getPlatform() !== "ios") { status = "unavailable"; return; }
  try { status = (await ATT.status()).status; } catch { status = "unknown"; }
}

export function initTrackingPermission(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (initialized) return initialized;
  initialized = (async () => {
    await Promise.all([
      refreshStatus(),
      (async () => {
        try {
          const response = await fetch("/cdn-cgi/trace", { signal: AbortSignal.timeout(2000) });
          if (response.ok) region = (await response.text()).match(/^loc=([A-Z0-9]{2})$/m)?.[1];
        } catch { region = undefined; }
      })(),
    ]);
    changed();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void refreshStatus().then(changed);
    });
    window.addEventListener("storage", changed);
  })();
  return initialized;
}

export function onTrackingPermissionChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Only invoked on the diffuser list, after the sound-check dialog is dismissed. */
export async function requestTrackingAfterSetup(): Promise<void> {
  await initTrackingPermission();
  if (requestPending || !shouldRequestTracking(Capacitor.getPlatform(), status, true) || document.visibilityState !== "visible") return;
  // No regional banner was requested: do not collect advertising acceptance there.
  if (!regionAllowsTracking(region)) return;
  requestPending = true;
  try {
    status = (await ATT.request()).status;
    if (status !== "notDetermined" && status !== "unknown") {
      try {
        const previous = JSON.parse(localStorage.getItem(EVIDENCE_KEY) ?? "null");
        localStorage.setItem(EVIDENCE_KEY, JSON.stringify({ status, at: new Date().toISOString(), region, noticeVersion: TRACKING_NOTICE_VERSION, acceptedAt: status === "authorized" ? new Date().toISOString() : previous?.acceptedAt }));
      } catch { /* Storage failure keeps email matching disabled. */ }
    }
  } catch { status = "unknown"; }
  finally { requestPending = false; changed(); }
}