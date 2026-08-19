import { buildTimerList, weekdayBit, type TimerSlot } from "@/lib/scentlife";

export type Intensity = "low" | "medium" | "high";

export type DaySchedule = {
  /** 0 = Sunday … 6 = Saturday */
  day: number;
  active: boolean;
  /** Selected hours of the day, 0–23. */
  hours: number[];
};

export const DAYS = [
  { value: 0, short: "Sun", long: "Sunday" },
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
];

/**
 * Intensity maps onto the device's spray (on) and pause (off) durations.
 * Low = shortest spray, longest pause. High = longest spray, shortest pause.
 */
export const INTENSITIES: {
  value: Intensity;
  label: string;
  blurb: string;
  onSeconds: number;
  offSeconds: number;
}[] = [
  {
    value: "low",
    label: "Low",
    blurb: "A whisper of scent. Best for bedrooms and small rooms.",
    onSeconds: 5,
    offSeconds: 600,
  },
  {
    value: "medium",
    label: "Medium",
    blurb: "Balanced diffusion for living rooms and offices.",
    onSeconds: 12,
    offSeconds: 240,
  },
  {
    value: "high",
    label: "High",
    blurb: "Full strength for open spaces and entryways.",
    onSeconds: 25,
    offSeconds: 60,
  },
];

export function intensityPreset(intensity: Intensity) {
  return INTENSITIES.find((i) => i.value === intensity) ?? INTENSITIES[1]!;
}

export function formatSeconds(seconds: number) {
  if (seconds < 60) return `${seconds} sec`;
  const minutes = seconds / 60;
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`;
}

/** Formats "14:30" or minutes-of-day as "2:30 PM" (US format). */
export function formatTime(value: string) {
  const [h = "0", m = "00"] = value.split(":");
  return formatHourLabel(Number(h), m);
}

export function formatHourLabel(hour: number, minutes = "00") {
  const suffix = hour >= 12 && hour < 24 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${minutes} ${suffix}`;
}

export function defaultHours() {
  // 8 AM → 11 PM
  return Array.from({ length: 15 }, (_, i) => i + 8);
}

export function defaultSchedule(): DaySchedule[] {
  return DAYS.map((d) => ({
    day: d.value,
    active: d.value >= 1 && d.value <= 5,
    hours: defaultHours(),
  }));
}

/** Contiguous hour blocks, e.g. [8..11, 14..18] → [[8,12],[14,19]] (end exclusive). */
export function hourRanges(hours: number[]): [number, number][] {
  const sorted = [...new Set(hours)].sort((a, b) => a - b);
  const ranges: [number, number][] = [];
  for (const hour of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && last[1] === hour) last[1] = hour + 1;
    else ranges.push([hour, hour + 1]);
  }
  return ranges;
}

export function formatHourRanges(hours: number[]) {
  const ranges = hourRanges(hours);
  if (ranges.length === 0) return "No hours selected";
  return ranges
    .map(([start, end]) => `${formatHourLabel(start)} – ${formatHourLabel(end % 24)}`)
    .join(" · ");
}

export function formatDays(days: number[]) {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 0) return "No days";
  if (sorted.length === 7) return "Every day";
  if (sorted.join(",") === "1,2,3,4,5") return "Weekdays";
  if (sorted.join(",") === "0,6") return "Weekends";
  return sorted.map((d) => DAYS[d]?.short).filter(Boolean).join(" · ");
}

export function activeDays(schedule: DaySchedule[]) {
  return schedule.filter((d) => d.active && d.hours.length > 0).map((d) => d.day);
}

/**
 * Turns the weekly schedule into device timer slots: days sharing the same hour
 * pattern are merged into one timer (weekday bitmask), each contiguous hour block
 * becomes a slot. Single-Bluetooth devices accept 5 timers, so we keep the first 5.
 */
export const MAX_TIMERS = 5;

export function buildTimerSlots(schedule: DaySchedule[], intensity: Intensity): TimerSlot[] {
  const preset = intensityPreset(intensity);
  const groups = new Map<string, { mask: number; hours: number[] }>();

  for (const day of schedule) {
    if (!day.active || day.hours.length === 0) continue;
    const key = [...new Set(day.hours)].sort((a, b) => a - b).join(",");
    const group = groups.get(key) ?? { mask: 0, hours: day.hours };
    group.mask |= weekdayBit(day.day);
    groups.set(key, group);
  }

  const slots: TimerSlot[] = [];
  for (const group of groups.values()) {
    for (const [start, end] of hourRanges(group.hours)) {
      slots.push({
        enabled: true,
        index: slots.length + 1,
        weekdayMask: group.mask,
        startMinute: start * 60,
        endMinute: Math.min(end * 60, 1440),
        onSeconds: preset.onSeconds,
        offSeconds: preset.offSeconds,
      });
    }
  }
  return slots.slice(0, MAX_TIMERS);
}

export function buildScheduleFrame(schedule: DaySchedule[], intensity: Intensity) {
  return buildTimerList(buildTimerSlots(schedule, intensity));
}

/**
 * Full push sequence the device acknowledges (and beeps for): clock sync, power
 * on, the whole timer list, then each timer individually via 0x14 — some
 * firmware only applies (and beeps for) the per-timer command. Unused slots are
 * explicitly disabled so old schedules do not linger on the device.
 */
export function buildPushFrames(schedule: DaySchedule[], intensity: Intensity) {
  const preset = intensityPreset(intensity);
  const slots = buildTimerSlots(schedule, intensity);
  const frames = [buildSyncTimestamp(), buildPower(true), buildTimerList(slots)];

  for (const slot of slots) frames.push(buildModifyTimer(slot));

  for (let index = slots.length + 1; index <= MAX_TIMERS; index += 1) {
    frames.push(
      buildModifyTimer({
        enabled: false,
        index,
        weekdayMask: 0,
        startMinute: 0,
        endMinute: 0,
        onSeconds: preset.onSeconds,
        offSeconds: preset.offSeconds,
      }),
    );
  }

  return frames;
}

