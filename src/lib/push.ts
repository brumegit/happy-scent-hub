import { queryTimers, sendFrames } from "@/lib/bluetooth";
import {
  buildPower,
  buildSetBroadcastName,
  buildSyncTimestamp,
  buildTimerList,
  MAX_BROADCAST_NAME_BYTES,
  type TimerSlot,
} from "@/lib/scentlife";
import { buildTimerSlots, MAX_TIMERS, type DaySchedule, type Intensity } from "@/lib/diffuser";
import { pushDebug } from "@/stores/pushDebugStore";

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
  const wanted = slots[0]!;

  try {
    // Rename first, on its own, retrying the two module-type bytes: modules
    // ignore a 0x52 whose module-type byte doesn't match their own firmware.
    if (!opts.hardwareName) {
      debug.set("name", "idle", "not sent");
    } else {
      await renameModule(opts.deviceId, opts.hardwareName, log);
    }

    const acks = await sendFrames(
      opts.deviceId,
      [buildSyncTimestamp(), buildTimerList(slots), buildPower(true)],
      log,
    );
    const ackFor = (fn: number) => acks.find((a) => a.fn === fn);


    const timerAck = ackFor(0x13);
    if (timerAck && timerAck.acked && timerAck.code !== 0) {
      for (const key of ["modes", "intensity", "schedule"] as const) {
        debug.set(key, "fail", `0x13 rejected (code ${timerAck.code})`);
      }
      return acks;
    }

    // Read back the persisted working modes — the only real proof.
    const readback = await queryTimers(opts.deviceId, log);
    if (!readback) {
      const detail = timerAck?.acked ? "ack 0x93 ok, no read-back" : "no ack, no read-back";
      debug.set("modes", "unconfirmed", detail);
      debug.set("intensity", "unconfirmed", detail);
      debug.set("schedule", "unconfirmed", detail);
      return acks;
    }

    verify(readback, wanted);
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

function verify(readback: TimerSlot[], wanted: TimerSlot) {
  const debug = pushDebug();
  const mode1 = readback.find((s) => s.index === 1);

  if (!mode1) {
    debug.set("modes", "fail", `device returned ${readback.length} timers, none at index 1`);
    debug.set("intensity", "fail", "working mode 1 missing");
    debug.set("schedule", "fail", "working mode 1 missing");
    return;
  }

  const others = readback.filter((s) => s.index !== 1 && s.index <= MAX_TIMERS);
  const stillOn = others.filter((s) => s.enabled).map((s) => s.index);
  debug.set(
    "modes",
    mode1.enabled === wanted.enabled && stillOn.length === 0 ? "ok" : "fail",
    `mode 1 ${mode1.enabled ? "on" : "off"} · ${
      stillOn.length ? `modes still on: ${stillOn.join(", ")}` : "modes 2–5 off"
    }`,
  );

  const intensityOk =
    mode1.onSeconds === wanted.onSeconds && mode1.offSeconds === wanted.offSeconds;
  debug.set(
    "intensity",
    intensityOk ? "ok" : "fail",
    `device spray ${mode1.onSeconds}s / pause ${mode1.offSeconds}s · sent ${wanted.onSeconds}s / ${wanted.offSeconds}s`,
  );

  // The firmware normalises end-of-day: 1439 (23:59) comes back as 1440.
  const sameMinute = (a: number, b: number) =>
    a === b || (a >= 1439 && b >= 1439) || Math.abs(a - b) <= 1;
  const scheduleOk =
    mode1.weekdayMask === wanted.weekdayMask &&
    sameMinute(mode1.startMinute, wanted.startMinute) &&
    sameMinute(mode1.endMinute, wanted.endMinute);
  debug.set(
    "schedule",
    scheduleOk ? "ok" : "fail",
    `device days 0b${mode1.weekdayMask.toString(2)} ${mode1.startMinute}–${mode1.endMinute} min · sent 0b${wanted.weekdayMask.toString(2)} ${wanted.startMinute}–${wanted.endMinute} min`,
  );
}

/** Pushes only the module (BLE advertising) name, used when renaming. */
export async function pushName(deviceId: string | null, hardwareName: string) {
  const debug = pushDebug();
  const log = (line: string) => pushDebug().addLog(line);
  debug.set("name", "pending");
  try {
    const acks = await sendFrames(deviceId, [buildSetBroadcastName(hardwareName)], log);
    const ack = acks[0];
    debug.set(
      "name",
      !ack?.acked ? "unconfirmed" : ack.code === 0 ? "ok" : "fail",
      `"${hardwareName}" · ${ack?.acked ? `ack 0xD2 code ${ack.code}` : "no 0xD2 reply"}`,
    );
  } catch (error) {
    debug.set("name", "fail", (error as Error).message);
    throw error;
  }
}
