import { describe, expect, it } from "vitest";
import { isBirdPlatformAllowed } from "./bird-policy";

describe("Bird app-only audience", () => {
  it("excludes browser visitors and unresolved platforms", () => {
    expect(isBirdPlatformAllowed("web")).toBe(false);
    expect(isBirdPlatformAllowed(undefined)).toBe(false);
    expect(isBirdPlatformAllowed("unknown")).toBe(false);
  });

  it("allows installed iPhone and Android apps", () => {
    expect(isBirdPlatformAllowed("ios")).toBe(true);
    expect(isBirdPlatformAllowed("android")).toBe(true);
  });
});