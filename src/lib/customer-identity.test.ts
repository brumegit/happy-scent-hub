import { describe, expect, it } from "vitest";
import { normalizeContactEmail } from "./customer-identity";

describe("optional contact email", () => {
  it("allows skipping without an email", () => {
    expect(normalizeContactEmail("")).toBeNull();
  });
  it("normalizes a valid entered email", () => {
    expect(normalizeContactEmail("  Customer@Example.com  ")).toBe("customer@example.com");
  });
  it("rejects invalid email before continuing", () => {
    expect(normalizeContactEmail("not-an-email")).toBeNull();
  });
});