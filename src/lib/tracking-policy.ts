export type TrackingStatus = "notDetermined" | "restricted" | "denied" | "authorized" | "unavailable" | "unknown";
export const TRACKING_NOTICE_VERSION = "att-meta-v1";
const CONSENT_COUNTRIES = new Set("AT BE BG HR CY CZ DK EE FI FR DE GR HU IS IE IT LV LI LT LU MT NL NO PL PT RO SK SI ES SE GB CH".split(" "));

export function regionAllowsTracking(region: string | undefined): boolean {
  return !!region && /^[A-Z]{2}$/.test(region) && !["XX", "T1"].includes(region) && !CONSENT_COUNTRIES.has(region);
}

export function trackingAllowed(platform: string, status: TrackingStatus, region: string | undefined): boolean {
  return regionAllowsTracking(region) && (platform !== "ios" || status === "authorized");
}

export function shouldRequestTracking(platform: string, status: TrackingStatus, setupFinished: boolean): boolean {
  return platform === "ios" && status === "notDetermined" && setupFinished;
}