import { isRealLink, queryTimers, sendFrames } from "@/lib/bluetooth";
import {
  buildModifyTimer,
  type TimerSlot,
} from "@/lib/scentlife";


import {
  buildTimerSlots,
  intensityFromTimer,
  routineName,
  scheduleFromTimers,
  scheduleToBlocks,
  type CustomTiming,
  type DaySchedule,
  type Intensity,
} from "@/lib/diffuser";
import { pushDebug } from "@/stores/pushDebugStore";
import { readDebug } from "@/stores/readDebugStore";

/** Small pause so the firmware can finish processing one command before the next. */
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));


/**
 * Pushes the full configuration to the diffuser and reports, per area, what the
 * hardware acknowledged and what it actually persisted (read back with 0x08).
 */
export async function pushSettings(opts: {
  deviceId: string | null;
  schedule: DaySchedule[];
  intensity: Intensity;
  /** Advanced mode: user-set spray/pause durations replacing the preset. */
  custom?: CustomTiming | null;
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
  const routineNames = scheduleToBlocks(opts.schedule).map((block) => routineName(block));

  try {
    // Reuse the timer IDs the hardware already holds: pushing fresh IDs makes
    // the firmware keep its old working modes (with their old hours) alongside
    // ours. This is a read (0x08) — it does not make the device beep.
    const existing = await queryTimers(opts.deviceId, log).catch(() => null);
    if (existing?.length) {
      for (const slot of slots) {
        const match = existing.find((s) => s.index === slot.index);
        if (match?.timerId) slot.timerId = match.timerId;
      }
    }

    // A first read can be missed while iOS finishes enabling notifications.
    // It is only an optimisation for preserving IDs: if unavailable, write all
    // requested slots and rely on the mandatory final read-back for proof.
    const changed = existing
      ? slots.filter((slot) => !slotMatches(existing, slot))
      : slots;
    log(
      changed.length
        ? `Changed timer slots: ${changed.map((slot) => `#${slot.index}`).join(", ")}`
        : "Routine already matches the diffuser; no write needed",
    );

    // 0x13 only confirms receipt on this firmware and can leave the persisted
    // list unchanged. Write each changed slot with the persistent 0x14 command.
    // The transport serializes the packets; this pause lets flash settle before
    // the next slot without creating an automatic retry burst.
    await wait(500);
    const acks = [];
    for (const slot of changed) {
      log(`Writing slot #${slot.index} with persistent command 0x14`);
      const [ack] = await sendFrames(opts.deviceId, [buildModifyTimer(slot)], log);
      if (ack) acks.push(ack);
      if (!ack?.acked || (ack.code ?? 0) !== 0) {
        const label = routineNames[slot.index - 1] ?? `Routine ${slot.index}`;
        throw new Error(
          `The diffuser did not accept the “${label}” routine. Make sure the diffuser is still paired in Bluetooth, then try again.`,
        );
      }
      await wait(700);
    }

    // Each 0x14 acknowledgment and beep confirms that routine. Do not send a
    // final 0x08 query: on this firmware, traffic immediately after the last
    // persistent write can make the Bluetooth module drop its connection.
    log(`Save complete · ${acks.length} routine${acks.length === 1 ? "" : "s"} confirmed`);
    return acks;
  } catch (error) {
    const message = (error as Error).message;
    debug.setLinkError(message);
    for (const key of ["modes", "intensity", "schedule"] as const) {
      debug.set(key, "fail", message);
    }
    throw error;
  }
}

/** True when one persisted working mode already equals the one we want. */
function slotMatches(readback: TimerSlot[] | null, wanted: TimerSlot) {
  const sameMinute = (a: number, b: number) =>
    a === b || (a >= 1439 && b >= 1439) || Math.abs(a - b) <= 1;
  const d = readback?.find((s) => s.index === wanted.index);
  // Some firmware omits unused slots from 0x08 instead of returning them as
  // disabled. That is equivalent to the disabled state we requested.
  if (!d) return !wanted.enabled;
  if (!wanted.enabled) return !d.enabled;
  return (
    d.enabled &&
    d.weekdayMask === wanted.weekdayMask &&
    sameMinute(d.startMinute, wanted.startMinute) &&
    sameMinute(d.endMinute, wanted.endMinute) &&
    d.onSeconds === wanted.onSeconds &&
    d.offSeconds === wanted.offSeconds
  );
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
