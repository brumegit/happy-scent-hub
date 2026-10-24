import { describe, expect, it } from "vitest";
import { shouldRequestTracking, trackingAllowed } from "./tracking-policy";

describe("Apple tracking permission", () => {
  it("never requests during Bluetooth or diffuser setup", () => {
    expect(shouldRequestTracking("ios", "notDetermined", false)).toBe(false);
  });
  it("requests after setup is finished", () => {
    expect(shouldRequestTracking("ios", "notDetermined", true)).toBe(true);
  });
  it("does not ask again after refusal", () => {
    expect(shouldRequestTracking("ios", "denied", true)).toBe(false);
  });
  it.each(["denied", "restricted", "notDetermined", "unknown", "unavailable"] as const)("blocks Meta for iOS status %s", (status) => {
    expect(trackingAllowed("ios", status, "US")).toBe(false);
  });
  it("permits authorized US iOS activity", () => {
    expect(trackingAllowed("ios", "authorized", "US")).toBe(true);
  });
  it("does not treat Apple authorization as regional consent", () => {
    expect(trackingAllowed("ios", "authorized", "FR")).toBe(false);
  });
  it("blocks an unresolved region", () => {
    expect(trackingAllowed("ios", "authorized", undefined)).toBe(false);
  });
});