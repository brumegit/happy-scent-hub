import { describe, expect, it } from "vitest";
import { resolveInstallId } from "./bird-push";

describe("Bird push install id", () => {
  it("keeps an existing id so the phone stays on the same Bird contact", () => {
    expect(resolveInstallId("brume-1234-abcd", () => "new")).toBe("brume-1234-abcd");
  });

  it("creates a prefixed id on first launch", () => {
    expect(resolveInstallId(null, () => "abc-123-def")).toBe("brume-abc-123-def");
  });

  it("replaces an unusable stored value", () => {
    expect(resolveInstallId("", () => "abc-123-def")).toBe("brume-abc-123-def");
  });
});
