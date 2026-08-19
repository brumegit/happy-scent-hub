import { isRealLink, queryTimers, sendFrames } from "@/lib/bluetooth";
import {
  buildModifyTimer,
  buildPower,
  buildSetBroadcastName,
  buildSyncTimestamp,
  buildTimerList,
  MODULE_TYPES,
  sanitizeBroadcastName,
  type TimerSlot,
} from "@/lib/scentlife";

import {
  buildTimerSlots,
  intensityFromTimer,
  scheduleFromTimers,
  MAX_TIMERS,
  type DaySchedule,
  type Intensity,
} from "@/lib/diffuser";
import { pushDebug } from "@/stores/pushDebugStore";
import { readDebug } from "@/stores/readDebugStore";

/**
 * Pushes the full configuration to the diffuser and reports, per area, what the
 * hardware acknowledged and what it actually persisted (read back with 0x08).
 *
 * Frame order matters: clock first, then the module name (0x52), then the full
 * timer list with working mode 1 active and 2–5 disabled (0x13), then power on.
 */
export async function pushSettings(opts: {
  deviceId: string | null;
  schedule: DaySchedule[];
  intensity: Intensity;
  hardwareName?: string;
}) {
  const debug = pushDebug();
  debug.begin();
  const log = (line: string) => pushDebug().addLog(line);

  const slots = buildTimerSlots(opts.schedule, opts.intensity);

  try {
    // Rename first, on its own, retrying the two module-type bytes: modules
    // ignore a 0x52 whose module-type byte doesn't match their own firmware.
    if (!opts.hardwareName) {
      debug.set("name", "idle", "not sent");
    } else {
      await renameModule(opts.deviceId, opts.hardwareName, log);
    }

    // Reuse the timer IDs the hardware already holds: pushing fresh IDs makes
    // the firmware keep its old working modes (with their old hours) alongside
    // ours, which is why the device still showed a stale end time.
    const existing = await queryTimers(opts.deviceId, log).catch(() => null);
    if (existing?.length) {
      for (const slot of slots) {
        const match = existing.find((s) => s.index === slot.index);
        if (match?.timerId) slot.timerId = match.timerId;
      }
    }

    const acks = await sendFrames(
      opts.deviceId,
      [buildSyncTimestamp(), buildTimerList(slots), buildPower(true)],
      log,
    );
    const ackFor = (fn: number) => acks.find((a) => a.fn === fn);

    const timerAck = ackFor(0x13);
    if (timerAck && timerAck.acked && timerAck.code !== 0) {
      log(`0x13 rejected (code ${timerAck.code}) — falling back to per-timer 0x14`);
    }

    // Read back the persisted working modes — the only real proof.
    let readback = await queryTimers(opts.deviceId, log);

    // 0x13 is the server-sync command; several firmwares only honour it inside
    // the sync handshake and silently keep their old modes. The app-initiated
    // path in the protocol is 0x14 (modify timer), one frame per working mode.
    if (!readback || !matches(readback, slots)) {
      log("Timer list not applied — retrying with 0x14 modify-timer per mode");
      await sendFrames(
        opts.deviceId,
        slots.map((slot) => buildModifyTimer(slot)),
        log,
      );
      readback = await queryTimers(opts.deviceId, log);
    }

    if (!readback) {
      const detail = timerAck?.acked ? "ack 0x93 ok, no read-back" : "no ack, no read-back";
      debug.set("modes", "unconfirmed", detail);
      debug.set("intensity", "unconfirmed", detail);
      debug.set("schedule", "unconfirmed", detail);
      return acks;
    }

    verify(readback, slots);
    return acks;

  } catch (error) {
    const message = (error as Error).message;
    debug.setLinkError(message);
    for (const key of ["name", "modes", "intensity", "schedule"] as const) {
      debug.set(key, "fail", message);
    }
    throw error;
  }
}

function verify(readback: TimerSlot[], wantedSlots: TimerSlot[]) {
  const debug = pushDebug();
  const wantedOn = wantedSlots.filter((s) => s.enabled);
  const deviceOn = readback.filter((s) => s.enabled && s.index <= MAX_TIMERS);

  const modesOk =
    deviceOn.length === wantedOn.length &&
    wantedOn.every((w) => deviceOn.some((d) => d.index === w.index));
  debug.set(
    "modes",
    modesOk ? "ok" : "fail",
    `device modes on: ${deviceOn.map((s) => s.index).join(", ") || "none"} · sent ${
      wantedOn.map((s) => s.index).join(", ") || "none"
    }`,
  );

  const reference = wantedOn[0] ?? wantedSlots[0]!;
  const intensityOk = deviceOn.length
    ? deviceOn.every(
        (s) => s.onSeconds === reference.onSeconds && s.offSeconds === reference.offSeconds,
      )
    : false;
  debug.set(
    "intensity",
    intensityOk ? "ok" : "fail",
    `device spray ${deviceOn[0]?.onSeconds ?? "–"}s / pause ${
      deviceOn[0]?.offSeconds ?? "–"
    }s · sent ${reference.onSeconds}s / ${reference.offSeconds}s`,
  );

  // The firmware normalises end-of-day: 1439 (23:59) comes back as 1440.
  const sameMinute = (a: number, b: number) =>
    a === b || (a >= 1439 && b >= 1439) || Math.abs(a - b) <= 1;
  const scheduleOk =
    wantedOn.length > 0 &&
    wantedOn.every((w) => {
      const d = readback.find((s) => s.index === w.index);
      return (
        !!d &&
        d.weekdayMask === w.weekdayMask &&
        sameMinute(d.startMinute, w.startMinute) &&
        sameMinute(d.endMinute, w.endMinute)
      );
    });
  debug.set(
    "schedule",
    scheduleOk ? "ok" : "fail",
    wantedOn
      .map((w) => {
        const d = readback.find((s) => s.index === w.index);
        return `#${w.index} device 0b${(d?.weekdayMask ?? 0).toString(2)} ${d?.startMinute ?? "–"}–${
          d?.endMinute ?? "–"
        } · sent 0b${w.weekdayMask.toString(2)} ${w.startMinute}–${w.endMinute}`;
      })
      .join(" | ") || "no window scheduled",
  );
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
  let last = "";
  for (const moduleType of MODULE_TYPES) {
    const acks = await sendFrames(deviceId, [buildSetBroadcastName(label, moduleType)], log);
    const ack = acks[0];
    if (ack?.acked && ack.code === 0) {
      debug.set("name", "ok", `"${label}" · ack 0xD2 (module type ${moduleType})`);
      return true;
    }
    last = ack?.acked
      ? `ack 0xD2 error ${ack.code} (module type ${moduleType})`
      : `no 0xD2 reply (module type ${moduleType})`;
  }
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
