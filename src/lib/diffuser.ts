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
  onSeconds: number;
  offSeconds: number;
}[] = [
  {
    value: "low",
    label: "Low",
    onSeconds: 5,
    offSeconds: 600,
  },
  {
    value: "medium",
    label: "Medium",
    onSeconds: 12,
    offSeconds: 240,
  },
  {
    value: "high",
    label: "High",
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
  const normalized = ((hour % 24) + 24) % 24;
  if (is24Hour()) return `${String(normalized).padStart(2, "0")}:${minutes}`;
  const suffix = normalized >= 12 ? "PM" : "AM";
  const displayHour = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${displayHour}:${minutes} ${suffix}`;
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

  // window key → weekday mask
  const windows = new Map<string, { start: number; end: number; mask: number }>();
  for (const day of schedule) {
    if (!day.active || day.hours.length === 0) continue;
    for (const [start, end] of hourRanges(day.hours)) {
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
      startMinute: enabled ? window!.start * 60 : 0,
      // The device rejects/clamps 1440, so a full day ends at 23:59.
      endMinute: enabled ? Math.min(window!.end * 60, 1439) : 0,
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
 * The hardware name we write to the module: "Device Room", no separator, kept
 * inside the module's 12 plain-ASCII byte limit.
 */
export function hardwareName(name: string, room?: string) {
  return sanitizeBroadcastName([name, room].filter(Boolean).join(" "));
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
  const schedule = DAYS.map((d) => ({ day: d.value, active: false, hours: [] as number[] }));

  for (const slot of active) {
    const hours = hoursOfTimer(slot);
    for (const day of schedule) {
      if ((slot.weekdayMask & weekdayBit(day.day)) === 0) continue;
      day.active = true;
      day.hours = [...new Set([...day.hours, ...hours])].sort((a, b) => a - b);
    }
  }

  return schedule.map((d) => ({ ...d, hours: d.hours.length ? d.hours : defaultHours() }));
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

  const isOn = (day: number, hour: number) =>
    !!schedule.find((d) => d.day === day && d.active)?.hours.includes(hour);

  const day = now.getDay();
  const hour = now.getHours();
  const running = isOn(day, hour);

  // Walk forward hour by hour (up to a week) to find the next state change.
  for (let step = 1; step <= 24 * 7; step += 1) {
    const next = new Date(now.getTime());
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + step);
    if (isOn(next.getDay(), next.getHours()) !== running) {
      const when = formatHourLabel(next.getHours());
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
