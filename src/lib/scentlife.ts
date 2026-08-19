/**
 * ScentLife serial protocol V1.x — frame builders.
 *
 * Frame: 0x55 0xAA | length (fn + content) | fn | content | checksum | 0x5A
 * Checksum = 256 - (sum(header..content) % 256), multi-byte fields little-endian.
 */

export const FN_SYNC_TIMESTAMP = 0x06;
export const FN_SET_COMMAND = 0x07;
export const FN_SYNC_TIMER_LIST = 0x13;
export const FN_MODIFY_TIMER = 0x14;
export const FN_GET_TIMERS = 0x08;

/** Device On/Off sub-command of 0x07. */
export const SET_POWER = 0x12;

export function checksum(bytes: number[]) {
  const sum = bytes.reduce((acc, b) => acc + b, 0);
  return (256 - (sum % 256)) & 0xff;
}

export function buildFrame(fn: number, content: number[] = []): Uint8Array {
  const body = [0x55, 0xaa, (content.length + 1) & 0xff, fn & 0xff, ...content];
  return Uint8Array.from([...body, checksum(body), 0x5a]);
}

const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
const u32 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff];

export function buildSyncTimestamp(date = new Date()) {
  const offsetSeconds = -date.getTimezoneOffset() * 60;
  return buildFrame(FN_SYNC_TIMESTAMP, u32(Math.floor(date.getTime() / 1000) + offsetSeconds));
}

export function buildPower(on: boolean) {
  return buildFrame(FN_SET_COMMAND, [SET_POWER, ...u16(on ? 1 : 0)]);
}

export type TimerSlot = {
  enabled: boolean;
  /** 1–5 on single-Bluetooth devices. */
  index: number;
  /** Bit0–Bit6 = Monday–Sunday. */
  weekdayMask: number;
  /** Minutes from 00:00 (0–1440). */
  startMinute: number;
  endMinute: number;
  /** Spray duration, seconds. */
  onSeconds: number;
  /** Pause between sprays, seconds. */
  offSeconds: number;
  timerId?: number;
};

export function timerBytes(slot: TimerSlot) {
  return [
    slot.enabled ? 1 : 0,
    slot.index & 0xff,
    ...u16(slot.weekdayMask),
    ...u16(slot.startMinute),
    ...u16(slot.endMinute),
    ...u16(slot.onSeconds),
    ...u16(slot.offSeconds),
    ...u32(slot.timerId ?? slot.index),
  ];
}

/** 0x08 — asks the device for its persisted working modes and real timer IDs. */
export function buildGetTimers() {
  return buildFrame(FN_GET_TIMERS);
}

export function parseTimerListResponse(frame: Uint8Array): TimerSlot[] {
  if (frame[3] !== FN_GET_TIMERS + 0x80) throw new Error("Unexpected timer response.");
  const count = (frame[4] ?? 0) | ((frame[5] ?? 0) << 8);
  if (frame.length < 8 + count * 16) throw new Error("Incomplete timer response from diffuser.");
  const read16 = (offset: number) => (frame[offset] ?? 0) | ((frame[offset + 1] ?? 0) << 8);
  const read32 = (offset: number) =>
    ((frame[offset] ?? 0) |
      ((frame[offset + 1] ?? 0) << 8) |
      ((frame[offset + 2] ?? 0) << 16) |
      ((frame[offset + 3] ?? 0) << 24)) >>> 0;
  return Array.from({ length: count }, (_, position) => {
    const offset = 6 + position * 16;
    return {
      enabled: frame[offset] !== 0,
      index: frame[offset + 1] ?? position + 1,
      weekdayMask: read16(offset + 2),
      startMinute: read16(offset + 4),
      endMinute: read16(offset + 6),
      onSeconds: read16(offset + 8),
      offSeconds: read16(offset + 10),
      timerId: read32(offset + 12),
    };
  });
}

/** 0x14 — add / modify a single timer. */
export function buildModifyTimer(slot: TimerSlot) {
  return buildFrame(FN_MODIFY_TIMER, timerBytes(slot));
}

/** 0x13 — push the full timer list in one frame. */
export function buildTimerList(slots: TimerSlot[]) {
  return buildFrame(FN_SYNC_TIMER_LIST, [
    ...u16(slots.length),
    ...slots.flatMap(timerBytes),
  ]);
}

/** Device weekday bit: Bit0 = Monday … Bit6 = Sunday (our day 0 = Sunday). */
export function weekdayBit(day: number) {
  return 1 << ((day + 6) % 7);
}

export function toHex(frame: Uint8Array) {
  return [...frame].map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

export const FN_SET_MODULE_INFO = 0x52;

/** Default identity bytes used by ScentLife single-Bluetooth diffusers. */
const MANUFACTURER_ID = 0x5a53;
const DEVICE_TYPE = "001";

/** Module type byte: 'A' Bluetooth only, 'B' Bluetooth+WiFi. */
export const MODULE_TYPES = ["A", "B"] as const;

/**
 * 0x52 carries an explicit length field, so the name is not limited to the
 * 12 characters of the protocol example. The real ceiling is the BLE
 * advertising payload: a complete local name fits in 29 bytes, and modules
 * silently drop non-ASCII, so we sanitise to ASCII and cap at 24 bytes.
 */
export const MAX_BROADCAST_NAME_BYTES = 24;

export function sanitizeBroadcastName(name: string) {
  const ascii = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 '._-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (ascii || "Brume").slice(0, MAX_BROADCAST_NAME_BYTES);
}

/** Characters the module accepts in a broadcast name. */
export const BROADCAST_NAME_PATTERN = /^[A-Za-z0-9 '._-]+$/;

/**
 * Validates a name against the module's specs: plain ASCII letters, digits,
 * space, hyphen or underscore, 1–12 characters. Returns an error message or
 * null when the name is compliant.
 */
export function validateBroadcastName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Enter a name.";
  if (!BROADCAST_NAME_PATTERN.test(trimmed))
    return "Use letters, numbers, spaces, hyphens or underscores only — no accents or symbols.";
  if (trimmed.length > MAX_BROADCAST_NAME_BYTES)
    return `The diffuser only stores ${MAX_BROADCAST_NAME_BYTES} characters (currently ${trimmed.length}).`;
  return null;
}


/**
 * 0x52 — set module info, including the BLE advertising (device) name.
 * This is the only command in the protocol that renames the hardware.
 */
export function buildSetBroadcastName(name: string, moduleType: string = "A") {
  const bytes = [...new TextEncoder().encode(sanitizeBroadcastName(name))];
  return buildFrame(FN_SET_MODULE_INFO, [
    ...u16(MANUFACTURER_ID),
    moduleType.charCodeAt(0),
    ...[...DEVICE_TYPE].map((c) => c.charCodeAt(0)),
    ...u16(bytes.length),
    ...bytes,
  ]);
}
