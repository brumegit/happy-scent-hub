import { describe, expect, it } from "vitest";
import { weekCoverage, weeklyHours, routineNames, daysUsed } from "./routine-stats";
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
