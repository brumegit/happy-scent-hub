// Weekly-usage summary sent with AppRoutinePushed. Coverage is the share of the
// week the diffuser is scheduled to run: 24/7 is 100, 12 hours a day is 50.

import {
  DAYS,
  INTENSITIES,
  dayRanges,
  intensityStars,
  routineName,
  scheduleToBlocks,
  type CustomTiming,
  type DaySchedule,
  type Intensity,
} from "@/lib/diffuser";

const WEEK_MINUTES = 7 * 24 * 60;

/** Scheduled minutes across the whole week (0 … 10080). */
export function scheduledMinutes(schedule: DaySchedule[]): number {
  let total = 0;
  for (const day of schedule) {
    if (!day.active) continue;
    for (const [start, end] of dayRanges(day)) {
      if (end > start) total += Math.min(1440, end) - start;
    }
  }
  return Math.min(WEEK_MINUTES, total);
}

/** 0–100: how much of the week is covered. 24/7 = 100, 12 h/day = 50. */
export function weekCoverage(schedule: DaySchedule[]): number {
  return Math.round((scheduledMinutes(schedule) / WEEK_MINUTES) * 100);
}

/** Hours scheduled per week, to one decimal. */
export function weeklyHours(schedule: DaySchedule[]): number {
  return Math.round((scheduledMinutes(schedule) / 60) * 10) / 10;
}

/** Routine names of a schedule, e.g. "Weekday morning, Always-on". */
export function routineNames(schedule: DaySchedule[]): string {
  return scheduleToBlocks(schedule)
    .map((block) => routineName(block))
    .join(", ")
    .slice(0, 300);
}

/** Days covered at least once, e.g. 7 for an every-day schedule. */
export function daysUsed(schedule: DaySchedule[]): number {
  return DAYS.filter((d) => {
    const day = schedule.find((s) => s.day === d.value);
    return !!day?.active && dayRanges(day).some(([start, end]) => end > start);
  }).length;
}

/**
 * Intensity level 1–5. With custom spray/pause times the nearest preset is
 * used, so the score still reflects how much oil the setting actually sprays.
 */
export function intensityLevel(intensity: Intensity, custom?: CustomTiming | null): number {
  if (!custom) return intensityStars(intensity);
  const closest = INTENSITIES.reduce(
    (best, preset) =>
      Math.abs(preset.onSeconds - custom.onSeconds) < Math.abs(best.onSeconds - custom.onSeconds)
        ? preset
        : best,
    INTENSITIES[2]!,
  );
  return closest.stars;
}

/**
 * Usage score 1–500: week coverage (0–100) × intensity level (1–5).
 * 24/7 on the highest intensity is 500, 12 h a day on Medium is 150.
 */
export function usageScore(
  schedule: DaySchedule[],
  intensity: Intensity,
  custom?: CustomTiming | null,
): number {
  return Math.max(1, Math.min(500, weekCoverage(schedule) * intensityLevel(intensity, custom)));
}
