import {
  buildModifyTimer,
  buildPower,
  buildSetBroadcastName,
  buildSyncTimestamp,
  buildTimerList,
  weekdayBit,
  type TimerSlot,
} from "@/lib/scentlife";

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
  const suffix = hour >= 12 && hour < 24 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
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
 * The app drives working mode 1 only: every other mode is pushed as disabled so
 * the device can never mix leftover factory programs with our schedule.
 * The weekly schedule is collapsed into one window: the union of active days
 * (weekday bitmask) and the earliest → latest selected hour.
 */
export function buildTimerSlots(schedule: DaySchedule[], intensity: Intensity): TimerSlot[] {
  const preset = intensityPreset(intensity);

  let mask = 0;
  let startHour = 24;
  let endHour = 0;
  for (const day of schedule) {
    if (!day.active || day.hours.length === 0) continue;
    mask |= weekdayBit(day.day);
    startHour = Math.min(startHour, Math.min(...day.hours));
    endHour = Math.max(endHour, Math.max(...day.hours) + 1);
  }

  const enabled = mask !== 0 && endHour > startHour;

  const slots: TimerSlot[] = [
    {
      enabled,
      index: 1,
      weekdayMask: enabled ? mask : 0,
      startMinute: enabled ? startHour * 60 : 0,
      endMinute: enabled ? Math.min(endHour * 60, 1440) : 0,
      onSeconds: preset.onSeconds,
      offSeconds: preset.offSeconds,
      timerId: 1,
    },
  ];

  // Working modes 2–5 are explicitly turned off.
  for (let index = 2; index <= MAX_TIMERS; index += 1) {
    slots.push({
      enabled: false,
      index,
      weekdayMask: 0,
      startMinute: 0,
      endMinute: 0,
      onSeconds: preset.onSeconds,
      offSeconds: preset.offSeconds,
      timerId: index,
    });
  }

  return slots;
}

export function buildScheduleFrame(schedule: DaySchedule[], intensity: Intensity) {
  return buildTimerList(buildTimerSlots(schedule, intensity));
}

/** The hardware name we write to the module: "Device name - Room name". */
export function hardwareName(name: string, room?: string) {
  return room ? `${name} - ${room}` : name;
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
    buildModifyTimer(slots[0]!),
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
