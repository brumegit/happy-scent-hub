import {
  isRealLink,
  queryTimers,
  sendFrames,
} from "@/lib/bluetooth";
import {
  buildSetBroadcastName,
  buildTimerList,
  MODULE_TYPES,
  sanitizeBroadcastName,
  toHex,
} from "@/lib/scentlife";


import {
  buildTimerSlots,
  intensityFromTimer,
  scheduleFromTimers,
  type CustomTiming,
  type DaySchedule,
  type Intensity,
} from "@/lib/diffuser";
import { pushDebug } from "@/stores/pushDebugStore";
import { readDebug } from "@/stores/readDebugStore";

/**
 * Pushes the full configuration using the diffuser's proven serial sequence.
 * The initial timer read gives the module the gap it requires before accepting
 * the timer-list write and preserves its existing timer identifiers.
 *
 * A settings confirmation emits one timer-list command (0x13). The module
 * signals each parsed protocol command, so concatenating clock/name/power
 * commands into the same BLE stream still causes repeated beeps.
 */
export async function pushSettings(opts: {
  deviceId: string | null;
  schedule: DaySchedule[];
  intensity: Intensity;
  /** Advanced mode: user-set spray/pause durations replacing the preset. */
  custom?: CustomTiming | null;
  hardwareName?: string;
}) {
  const debug = pushDebug();
  debug.begin();
  const log = (line: string) => pushDebug().addLog(line);

  log(
    `Push start · device ${opts.deviceId ?? "none"} · link ${
      isRealLink(opts.deviceId) ? "live" : "not live (simulated or missing)"
    }`,
  );

  const slots = buildTimerSlots(opts.schedule, opts.intensity, opts.custom ?? null);

  try {
    const existing = await queryTimers(opts.deviceId, log).catch(() => null);
    if (existing?.length) {
      for (const slot of slots) {
        const match = existing.find((saved) => saved.index === slot.index);
        if (match?.timerId) slot.timerId = match.timerId;
      }
    }

    // One user action, one 0x13 command, and one hardware confirmation sound.
    // Missing notifications are deliberately not treated as a failed send.
    const label = opts.hardwareName ? sanitizeBroadcastName(opts.hardwareName) : null;
    const frame = buildTimerList(slots);
    const active = slots.filter((slot) => slot.enabled);
    log(
      `Sending 0x13 timer list · ${active.length}/${slots.length} active · intensity ${opts.intensity}`,
    );
    for (const slot of slots) {
      log(
        `Mode ${slot.index}: ${slot.enabled ? "ON" : "OFF"} · days 0b${slot.weekdayMask
          .toString(2)
          .padStart(7, "0")} · ${slot.startMinute}–${slot.endMinute} min · spray ${slot.onSeconds}s / pause ${slot.offSeconds}s`,
      );
    }
    log(`Frame ${frame.length} bytes · ${toHex(frame)}`);
    await sendFrames(opts.deviceId, [frame], log);

    debug.set("name", "idle", label ? `"${label}" · unchanged by settings push` : "not sent");
    debug.set("modes", "ok", `0x13 sent · ${active.length} active mode(s)`);
    debug.set("intensity", "ok", `${opts.intensity} · ${active[0]?.onSeconds ?? 0}s/${active[0]?.offSeconds ?? 0}s`);
    debug.set("schedule", "ok", `${frame.length} bytes sent over live link`);

  } catch (error) {
    const message = (error as Error).message;
    debug.setLinkError(message);
    for (const key of ["name", "modes", "intensity", "schedule"] as const) {
      debug.set(key, "fail", message);
    }
    throw error;
  }
}

/**
 * Sends 0x52 (set module info) and waits for the 0xD2 reply, retrying with the
 * other module-type byte when the module stays silent. Reports to the debug
 * strip and returns true when the hardware confirmed the new name.
 */
export async function renameModule(
  deviceId: string | null,
  hardwareName: string,
  log?: (line: string) => void,
) {
  const debug = pushDebug();
  const label = sanitizeBroadcastName(hardwareName);
  const moduleType = MODULE_TYPES[0] ?? 0;
  const acks = await sendFrames(deviceId, [buildSetBroadcastName(label, moduleType)], log);
  const ack = acks[0];
  if (ack?.acked && ack.code === 0) {
    debug.set("name", "ok", `"${label}" · ack 0xD2 (module type ${moduleType})`);
    return true;
  }
  const last = ack?.acked
    ? `ack 0xD2 error ${ack.code} (module type ${moduleType})`
    : `no 0xD2 reply (module type ${moduleType})`;
  debug.set("name", "unconfirmed", `"${label}" · ${last}`);
  return false;
}

/** Pushes only the module (BLE advertising) name, used when renaming. */
export async function pushName(deviceId: string | null, hardwareName: string) {
  const debug = pushDebug();
  const log = (line: string) => pushDebug().addLog(line);
  debug.set("name", "pending");
  try {
    await renameModule(deviceId, hardwareName, log);
  } catch (error) {
    debug.set("name", "fail", (error as Error).message);
    throw error;
  }
}

/**
 * Reads the diffuser's live configuration (working modes 0x08) right after
 * pairing so the intensity and schedule selectors start from the real device
 * state instead of app defaults. Reports to the READ debug strip.
 */
export async function readSettings(deviceId: string | null) {
  const debug = readDebug();
  debug.begin();
  const log = (line: string) => readDebug().addLog(line);

  if (!isRealLink(deviceId)) {
    for (const key of ["link", "modes", "intensity", "schedule"] as const) {
      debug.set(key, "unconfirmed", "no live Bluetooth link");
    }
    return null;
  }
  debug.set("link", "ok", "GATT link live");

  const timers = await queryTimers(deviceId, log).catch((error: Error) => {
    debug.set("modes", "fail", error.message);
    return null;
  });

  if (!timers) {
    for (const key of ["modes", "intensity", "schedule"] as const) {
      debug.set(key, "unconfirmed", "device returned no timer list");
    }
    return null;
  }

  const active = timers.filter((t) => t.enabled).map((t) => t.index);
  debug.set(
    "modes",
    "ok",
    `${timers.length} modes · active: ${active.length ? active.join(", ") : "none"}`,
  );

  const mode1 = timers.find((t) => t.index === 1) ?? timers[0];
  if (!mode1) {
    debug.set("intensity", "unconfirmed", "no working mode 1");
    debug.set("schedule", "unconfirmed", "no working mode 1");
    return null;
  }

  const intensity = intensityFromTimer(mode1);
  debug.set("intensity", "ok", `spray ${mode1.onSeconds}s / pause ${mode1.offSeconds}s → ${intensity}`);

  const schedule = scheduleFromTimers(timers);
  debug.set(
    "schedule",
    mode1.enabled ? "ok" : "unconfirmed",
    `days 0b${mode1.weekdayMask.toString(2)} · ${mode1.startMinute}–${mode1.endMinute} min${
      mode1.enabled ? "" : " (mode 1 disabled)"
    }`,
  );

  return { intensity, schedule, timers };
}
