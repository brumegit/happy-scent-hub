import {
  buildPower,
  buildSetBroadcastName,
  buildSyncTimestamp,
  buildTimerList,
  sanitizeBroadcastName,
  weekdayBit,
  type TimerSlot,
} from "@/lib/scentlife";
import { is24Hour } from "@/stores/clockStore";

export type Intensity = "very-low" | "low" | "medium" | "high" | "very-high";

export type DaySchedule = {
  /** 0 = Sunday … 6 = Saturday */
  day: number;
  active: boolean;
  /** Selected hours of the day, 0–23 (kept for legacy/coarse views). */
  hours: number[];
  /**
   * Minute-precision windows [startMinute, endMinute) within the day, 0–1439.
   * When present this is the source of truth; `hours` is a rounded mirror.
   */
  ranges?: [number, number][];
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
  /** 1–5, the number of filled stars shown in the picker. */
  stars: number;
  onSeconds: number;
  offSeconds: number;
}[] = [
  {
    value: "very-low",
    label: "Very low",
    stars: 1,
    onSeconds: 12,
    offSeconds: 600,
  },
  {
    value: "low",
    label: "Low",
    stars: 2,
    onSeconds: 16,
    offSeconds: 420,
  },
  {
    value: "medium",
    label: "Medium",
    stars: 3,
    onSeconds: 20,
    offSeconds: 240,
  },
  {
    value: "high",
    label: "High",
    stars: 4,
    onSeconds: 22,
    offSeconds: 120,
  },
  {
    value: "very-high",
    label: "Very high",
    stars: 5,
    onSeconds: 25,
    offSeconds: 60,
  },
];

export function intensityPreset(intensity: Intensity) {
  return INTENSITIES.find((i) => i.value === intensity) ?? INTENSITIES[2]!;
}

/** Star count (1–5) of an intensity, and the reverse lookup. */
export function intensityStars(intensity: Intensity) {
  return intensityPreset(intensity).stars;
}

export function intensityFromStars(stars: number): Intensity {
  return (INTENSITIES.find((i) => i.stars === stars) ?? INTENSITIES[2]!).value;
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
  const normalized = ((hour % 24) + 24) % 24;
  if (is24Hour()) return `${String(normalized).padStart(2, "0")}:${minutes}`;
  const suffix = normalized >= 12 ? "PM" : "AM";
  const displayHour = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${displayHour}:${minutes} ${suffix}`;
}

/** Minutes-of-day → "8:30 AM" / "08:30" depending on the clock preference. */
export function formatMinutes(minutes: number) {
  const clamped = Math.max(0, Math.min(1439, Math.round(minutes)));
  const hour = Math.floor(clamped / 60);
  return formatHourLabel(hour, String(clamped % 60).padStart(2, "0"));
}

/** Minutes-of-day → "08:30", the value format of <input type="time">. */
export function minutesToTimeValue(minutes: number) {
  const clamped = Math.max(0, Math.min(1439, Math.round(minutes)));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

export function timeValueToMinutes(value: string) {
  const [h = "0", m = "0"] = value.split(":");
  return Math.max(0, Math.min(1439, Number(h) * 60 + Number(m)));
}

/** Minute windows of a day: the stored ranges, or the hours rounded up. */
export function dayRanges(day: DaySchedule): [number, number][] {
  if (day.ranges?.length) return day.ranges.map(([s, e]) => [s, e] as [number, number]);
  return hourRanges(day.hours).map(([s, e]) => [s * 60, Math.min(e * 60, 1439)] as [number, number]);
}

export function defaultHours() {
  // Always on — every hour of the day.
  return Array.from({ length: 24 }, (_, i) => i);
}

export function defaultSchedule(): DaySchedule[] {
  return DAYS.map((d) => ({
    day: d.value,
    active: true,
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
  if (ranges.length === 1 && ranges[0]![0] === 0 && ranges[0]![1] === 24) return "Always on";
  return ranges
    .map(([start, end]) => `${formatHourLabel(start)} to ${formatHourLabel(end % 24)}`)
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

/** Active days grouped by the exact set of minute windows they share. */
export function scheduleWindows(schedule: DaySchedule[]) {
  const groups = new Map<string, { days: number[]; ranges: [number, number][] }>();
  for (const day of schedule) {
    if (!day.active) continue;
    const ranges = dayRanges(day).sort((a, b) => a[0] - b[0]);
    if (ranges.length === 0) continue;
    const key = ranges.map((r) => r.join("-")).join(",");
    const existing = groups.get(key);
    if (existing) existing.days.push(day.day);
    else groups.set(key, { days: [day.day], ranges });
  }
  return [...groups.values()];
}

/** "8:00 AM to 8:30 PM · 10:00 PM to 11:00 PM" for a list of minute windows. */
export function formatMinuteRanges(ranges: [number, number][]) {
  if (ranges.length === 0) return "No hours selected";
  if (ranges.length === 1 && ranges[0]![0] === 0 && ranges[0]![1] >= 1439) return "Always on";
  return ranges
    .map(([start, end]) => `${formatMinutes(start)} to ${formatMinutes(end)}`)
    .join(" · ");
}

/** One human line per group of days sharing the same windows. */
export function formatScheduleLines(schedule: DaySchedule[]) {
  const groups = scheduleWindows(schedule);
  if (groups.length === 0) return ["No days scheduled"];
  return groups.map((g) => `${formatDays(g.days)} · ${formatMinuteRanges(g.ranges)}`);
}

/**
 * Number of hardware working modes a schedule needs: one per distinct
 * contiguous time window (days sharing a window are merged into one mode).
 */
export function timerWindowCount(schedule: DaySchedule[]) {
  const windows = new Set<string>();
  for (const day of schedule) {
    if (!day.active) continue;
    for (const [start, end] of dayRanges(day)) windows.add(`${start}-${end}`);
  }
  return windows.size;
}

/**
 * Collapses the schedule so it always fits the hardware: every active day gets
 * the same hours (the union of what is selected today).
 */
export function unifySchedule(schedule: DaySchedule[]): DaySchedule[] {
  const union = [...new Set(schedule.filter((d) => d.active).flatMap((d) => d.hours))].sort(
    (a, b) => a - b,
  );
  const hours = union.length ? union : defaultHours();
  return schedule.map((d) => (d.active ? { ...d, hours } : d));
}

/**
 * A time block is exactly one hardware working mode: one contiguous window
 * expressed in MINUTES of the day (`start`, `end` exclusive, 0–1439) applied to
 * a set of weekdays. Minute granularity matches the ScentLife protocol, whose
 * timer slots carry startMinute / endMinute. The schedule editor works in
 * blocks so the 5-mode hardware limit is a UI limit, never an error.
 */
export type TimeBlock = { start: number; end: number; days: number[] };

/** Splits a weekly schedule into blocks (one per distinct contiguous window). */
export function scheduleToBlocks(schedule: DaySchedule[]): TimeBlock[] {
  const map = new Map<string, TimeBlock>();
  for (const day of schedule) {
    if (!day.active) continue;
    for (const [start, end] of dayRanges(day)) {
      const key = `${start}-${end}`;
      const existing = map.get(key);
      if (existing) existing.days.push(day.day);
      else map.set(key, { start, end, days: [day.day] });
    }
  }
  return [...map.values()].sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Rebuilds the weekly schedule from blocks. */
export function blocksFromSchedule(schedule: DaySchedule[]): TimeBlock[] {
  const blocks = scheduleToBlocks(schedule);
  return blocks.length ? blocks : [{ start: 0, end: 1439, days: DAYS.map((d) => d.value) }];
}

export function blocksToSchedule(blocks: TimeBlock[]): DaySchedule[] {
  return DAYS.map((d) => {
    const ranges = blocks
      .filter((b) => b.days.includes(d.value) && b.end > b.start)
      .map((b) => [b.start, b.end] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const hours = [
      ...new Set(
        ranges.flatMap(([start, end]) => {
          const from = Math.floor(start / 60);
          const to = Math.min(24, Math.ceil(end / 60));
          return Array.from({ length: Math.max(1, to - from) }, (_, i) => from + i);
        }),
      ),
    ].sort((a, b) => a - b);
    const day: DaySchedule = {
      day: d.value,
      active: ranges.length > 0,
      hours: hours.length ? hours : defaultHours(),
    };
    if (ranges.length) day.ranges = ranges;
    return day;
  });
}

/** Human label for one block, e.g. "Mon · Tue · 8:00 AM to 8:30 PM". */
export function formatBlock(block: TimeBlock) {
  return `${formatDays(block.days)} · ${formatMinuteRanges([[block.start, block.end]])}`;
}

/**
 * A routine never gets a numbered label ("Time block 1"). Its name is derived
 * from what it actually is — the days it runs on and the part of the day it
 * covers — so it reads back naturally the next time the user opens it. Names
 * describe time only, never a place. Anything we can't characterise falls back
 * to "My routine".
 */
function routineDayWord(days: number[]) {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const key = sorted.join(",");
  if (sorted.length === 7) return "Daily";
  if (key === "1,2,3,4,5") return "Weekday";
  if (key === "0,6") return "Weekend";
  if (key === "5,6") return "Late-week";
  if (key === "0,1,2,3,4") return "Early-week";
  if (sorted.length === 1) return DAYS[sorted[0]!]?.long ?? "";
  if (sorted.length === 2) return `${DAYS[sorted[0]!]?.long} & ${DAYS[sorted[1]!]?.long}`;
  return "";
}

function routineTimeWord(start: number, end: number) {
  const span = end - start;
  if (start <= 5 && end >= 1435) return "all-day";
  if (span <= 75) {
    if (start < 300) return "night cap";
    if (start < 660) return "morning boost";
    if (start < 1020) return "afternoon boost";
    return "evening boost";
  }
  if (start >= 1260 || start < 240) return "overnight";
  if (start < 300) return "early morning";
  if (start < 660 && end <= 900) return "morning";
  if (start < 660 && end > 1140) return "all-waking-hours";
  if (start < 660) return "daytime";
  if (start < 810) return "midday";
  if (start < 1020) return "afternoon";
  if (start < 1260) return "evening";
  return "late evening";
}

/** The descriptive part of a routine name stays short enough for one line. */
const MAX_ROUTINE_NAME = 25;

/** Compact lowercase time label, e.g. "8am", "2:30pm", or "14:30" in 24h. */
function compactTimeLabel(minutes: number) {
  const clamped = Math.max(0, Math.min(1440, Math.round(minutes)));
  const hour = clamped === 1440 ? 0 : Math.floor(clamped / 60);
  const min = clamped === 1440 ? 0 : clamped % 60;
  if (is24Hour()) return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  const suffix = hour >= 12 ? "pm" : "am";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return min === 0 ? `${displayHour}${suffix}` : `${displayHour}:${String(min).padStart(2, "0")}${suffix}`;
}

/** Working-hours suffix, e.g. "(8am → 2pm)". Null for all-day routines. */
function routineHoursLabel(block: TimeBlock): string | null {
  if (block.start <= 5 && block.end >= 1435) return null;
  const end = block.end >= 1439 ? 1440 : block.end;
  return `(${compactTimeLabel(block.start)} → ${compactTimeLabel(end)})`;
}

export function routineName(block: TimeBlock) {
  const hours = routineHoursLabel(block);
  const suffix = hours ? ` ${hours}` : "";
  const day = routineDayWord(block.days);
  const time = routineTimeWord(block.start, block.end);
  if (day === "Daily" && time === "all-day") return `Always-on${suffix}`.trim();
  if (!day && !time) return `Custom${suffix}`.trim();
  const label = `${day} ${time}`.trim().replace(/\s+/g, " ");
  const cased = label.charAt(0).toUpperCase() + label.slice(1);
  // Keep the descriptive part within the limit; hours are appended after.
  const trimmed =
    cased.length <= MAX_ROUTINE_NAME
      ? cased
      : cased.slice(0, MAX_ROUTINE_NAME).replace(/[\s&-]+\S*$/, "");
  return `${trimmed}${suffix}`;
}





/** Single-Bluetooth devices expose 5 working modes (timers). */
export const MAX_TIMERS = 5;


/**
 * A hardware working mode holds ONE time window (start → end) plus the set of
 * weekdays it applies to and the spray/pause frequency. It cannot hold
 * different hours per day.
 *
 * Workaround: the weekly schedule is split into windows. Every contiguous hour
 * block is keyed by "start-end" and the days that share it are merged into one
 * weekday mask, so "Mon–Fri 8→20, Sat–Sun 10→23" becomes two working modes.
 * The device exposes 5 modes; if a schedule needs more windows, the extra ones
 * are merged into the last mode (widest start → end) so nothing is lost.
 * Unused modes are pushed disabled so leftover factory programs can never run.
 */
export function buildTimerSlots(schedule: DaySchedule[], intensity: Intensity): TimerSlot[] {
  const preset = intensityPreset(intensity);

  // window key (minutes of the day) → weekday mask
  const windows = new Map<string, { start: number; end: number; mask: number }>();
  for (const day of schedule) {
    if (!day.active) continue;
    for (const [start, end] of dayRanges(day)) {
      const key = `${start}-${end}`;
      const existing = windows.get(key);
      if (existing) existing.mask |= weekdayBit(day.day);
      else windows.set(key, { start, end, mask: weekdayBit(day.day) });
    }
  }

  let list = [...windows.values()].sort((a, b) => a.start - b.start || a.end - b.end);

  // More windows than the hardware can store: fold the overflow into the last mode.
  if (list.length > MAX_TIMERS) {
    const kept = list.slice(0, MAX_TIMERS - 1);
    const overflow = list.slice(MAX_TIMERS - 1);
    kept.push({
      start: Math.min(...overflow.map((w) => w.start)),
      end: Math.max(...overflow.map((w) => w.end)),
      mask: overflow.reduce((m, w) => m | w.mask, 0),
    });
    list = kept;
  }

  return Array.from({ length: MAX_TIMERS }, (_, i) => {
    const index = i + 1;
    const window = list[i];
    const enabled = !!window && window.mask !== 0 && window.end > window.start;
    return {
      enabled,
      index,
      weekdayMask: enabled ? window!.mask : 0,
      // Windows are already minutes of the day (minute granularity, 0–1439).
      startMinute: enabled ? Math.max(0, Math.min(1439, Math.round(window!.start))) : 0,
      // The device rejects/clamps 1440, so a full day ends at 23:59.
      endMinute: enabled ? Math.max(0, Math.min(1439, Math.round(window!.end))) : 0,
      onSeconds: preset.onSeconds,
      offSeconds: preset.offSeconds,
      timerId: index,
    };
  });
}

export function buildScheduleFrame(schedule: DaySchedule[], intensity: Intensity) {
  return buildTimerList(buildTimerSlots(schedule, intensity));
}

/**
 * The BLE advertising name written to the module: always "Brume <Room>", so the
 * hardware is recognisable in any Bluetooth list whatever the in-app device
 * name is. Kept inside the module's plain-ASCII byte limit.
 */
export function hardwareName(_name: string, room?: string) {
  return sanitizeBroadcastName(["Brume", room].filter(Boolean).join(" "));
}

/** Reverse of buildTimerSlots: the intensity whose spray duration matches. */
export function intensityFromTimer(slot: TimerSlot): Intensity {
  const closest = [...INTENSITIES].sort(
    (a, b) => Math.abs(a.onSeconds - slot.onSeconds) - Math.abs(b.onSeconds - slot.onSeconds),
  )[0]!;
  return closest.value;
}

function hoursOfTimer(slot: TimerSlot) {
  const startHour = Math.max(0, Math.min(23, Math.floor(slot.startMinute / 60)));
  const endHour = slot.endMinute >= 1439 ? 24 : Math.max(startHour + 1, Math.ceil(slot.endMinute / 60));
  return Array.from({ length: Math.min(24, endHour) - startHour }, (_, i) => startHour + i);
}

/** Reverse of buildTimerSlots: the weekly schedule stored in working mode 1. */
export function scheduleFromTimer(slot: TimerSlot): DaySchedule[] {
  return scheduleFromTimers([slot]);
}

/**
 * Reverse of buildTimerSlots: merges every enabled working mode back into one
 * weekly schedule, each mode contributing its hours to the days it covers.
 */
export function scheduleFromTimers(slots: TimerSlot[]): DaySchedule[] {
  const active = slots.filter((s) => s.enabled && s.endMinute > s.startMinute);
  const schedule = DAYS.map((d) => ({
    day: d.value,
    active: false,
    hours: [] as number[],
    ranges: [] as [number, number][],
  }));

  for (const slot of active) {
    const hours = hoursOfTimer(slot);
    for (const day of schedule) {
      if ((slot.weekdayMask & weekdayBit(day.day)) === 0) continue;
      day.active = true;
      day.hours = [...new Set([...day.hours, ...hours])].sort((a, b) => a - b);
      // Minute-accurate window straight from the hardware timer.
      day.ranges = [...day.ranges, [slot.startMinute, slot.endMinute] as [number, number]].sort(
        (a, b) => a[0] - b[0],
      );
    }
  }

  return schedule.map((d) => {
    const day: DaySchedule = {
      day: d.day,
      active: d.active,
      hours: d.hours.length ? d.hours : defaultHours(),
    };
    if (d.ranges.length) day.ranges = d.ranges;
    return day;
  });
}


/**
 * Push sequence per the ScentLife protocol:
 * clock sync (0x06) → full timer list with mode 1 active and 2–5 off (0x13)
 * → mode 1 confirmed individually (0x14) → power on (0x07 / 0x12)
 * → optional module rename (0x52).
 */
export function buildPushFrames(
  schedule: DaySchedule[],
  intensity: Intensity,
  deviceName?: string,
) {
  const slots = buildTimerSlots(schedule, intensity);
  const frames = [
    buildSyncTimestamp(),
    buildTimerList(slots),
    buildPower(true),
  ];
  if (deviceName) frames.push(buildSetBroadcastName(deviceName));
  return frames;
}


/** Human summary of what the device should be doing at `now`, per its schedule. */
export function scheduleStatus(
  schedule: DaySchedule[],
  scheduleActive: boolean,
  now: Date = new Date(),
  intensityLabel = "",
) {
  const level = intensityLabel ? ` at ${intensityLabel.toLowerCase()} intensity` : "";
  if (!scheduleActive) return "The schedule is paused. The diffuser will not spray until you turn it back on.";

  // Minute-accurate: a day is on when the minute falls inside one of its windows.
  const isOn = (dayIndex: number, minute: number) => {
    const entry = schedule.find((d) => d.day === dayIndex && d.active);
    if (!entry) return false;
    return dayRanges(entry).some(([start, end]) => minute >= start && minute < Math.max(end, start + 1));
  };

  const day = now.getDay();
  const running = isOn(day, now.getHours() * 60 + now.getMinutes());

  // Walk forward minute by minute (up to a week) to find the next state change.
  for (let step = 1; step <= 60 * 24 * 7; step += 1) {
    const next = new Date(now.getTime());
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + step);
    if (isOn(next.getDay(), next.getHours() * 60 + next.getMinutes()) !== running) {
      const when = formatMinutes(next.getHours() * 60 + next.getMinutes());
      const dayLabel = next.getDay() === day ? "" : ` on ${DAYS[next.getDay()]?.long}`;
      return running
        ? `The diffuser is programmed to be running${level} and scheduled to pause at ${when}${dayLabel}.`
        : `The diffuser is programmed to be in pause and scheduled to resume${level} at ${when}${dayLabel}.`;
    }
  }

  return running
    ? `The diffuser is programmed to run continuously${level}.`
    : "No hours are scheduled, so the diffuser stays in pause.";
}
