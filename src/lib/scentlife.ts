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

function timerBytes(slot: TimerSlot) {
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

/** 0x15 — set the device (Bluetooth) name, ASCII, length-prefixed. */
export const FN_SET_DEVICE_NAME = 0x15;

export function buildSetDeviceName(name: string) {
  const bytes = [...name].slice(0, 20).map((c) => c.charCodeAt(0) & 0x7f);
  return buildFrame(FN_SET_DEVICE_NAME, [bytes.length, ...bytes]);
}
