import { describe, expect, it } from "vitest";
import { weekCoverage, weeklyHours, routineNames, daysUsed, usageScore } from "./routine-stats";
import { defaultSchedule, type DaySchedule } from "./diffuser";

function withRanges(ranges: [number, number][]): DaySchedule[] {
  return defaultSchedule().map((d) => ({ ...d, ranges }));
}

describe("weekly coverage", () => {
  it("counts 24/7 as 100", () => {
    expect(weekCoverage(withRanges([[0, 1439]]))).toBe(100);
  });
  it("counts 12 hours a day as 50", () => {
    expect(weekCoverage(withRanges([[480, 1200]]))).toBe(50);
    expect(weeklyHours(withRanges([[480, 1200]]))).toBe(84);
  });
  it("counts nothing as 0", () => {
    const empty = defaultSchedule().map((d) => ({ ...d, active: false, hours: [], ranges: [] }));
    expect(weekCoverage(empty)).toBe(0);
    expect(daysUsed(empty)).toBe(0);
  });
  it("names routines without clock times", () => {
    const names = routineNames(withRanges([[480, 1200]]));
    expect(names).toBe("Daily all-waking-hours");
    expect(names).not.toMatch(/AM|PM/);
  });
});

describe("usage score", () => {
  it("is coverage x intensity, 100 x 5 = 500", () => {
    expect(usageScore(withRanges([[0, 1439]]), "very-high")).toBe(500);
  });
  it("is 12 h a day on Medium = 150", () => {
    expect(usageScore(withRanges([[480, 1200]]), "medium")).toBe(150);
  });
  it("is 24/7 on Low = 200", () => {
    expect(usageScore(withRanges([[0, 1439]]), "low")).toBe(200);
  });
  it("never drops below 1", () => {
    const empty = defaultSchedule().map((d) => ({ ...d, active: false, hours: [], ranges: [] }));
    expect(usageScore(empty, "high")).toBe(1);
  });
  it("uses the closest preset when spray times are custom", () => {
    // 20 s spray matches Medium (3 stars): 100 x 3 = 300.
    expect(usageScore(withRanges([[0, 1439]]), "high", { onSeconds: 20, offSeconds: 240 })).toBe(
      300,
    );
  });
});
