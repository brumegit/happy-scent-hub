import { describe, expect, it } from "vitest";
import { isBirdPlatformAllowed } from "./bird-policy";

describe("Bird audience", () => {
  it("excludes anonymous browser visitors and unresolved platforms", () => {
    expect(isBirdPlatformAllowed("web")).toBe(false);
    expect(isBirdPlatformAllowed("web", false)).toBe(false);
    expect(isBirdPlatformAllowed(undefined, true)).toBe(false);
    expect(isBirdPlatformAllowed("unknown", true)).toBe(false);
  });

  it("includes browser visitors who declared an email", () => {
    expect(isBirdPlatformAllowed("web", true)).toBe(true);
  });

  it("allows installed iPhone and Android apps", () => {
    expect(isBirdPlatformAllowed("ios")).toBe(true);
    expect(isBirdPlatformAllowed("android")).toBe(true);
  });
});
