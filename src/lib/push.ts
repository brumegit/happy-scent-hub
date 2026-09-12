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
  /** Last schedule successfully saved by this app, used when iOS cannot read the device. */
  previousSchedule?: DaySchedule[] | null;
  intensity: Intensity;
  /** Advanced mode: user-set spray/pause durations replacing the preset. */
  custom?: CustomTiming | null;
}) {
  const debug = pushDebug();
  debug.begin();
  // Keep a local trail so any failure can name the exact step that broke.
  const trail: string[] = [];
  const log = (line: string) => {
    trail.push(line);
    pushDebug().addLog(line);
  };

  log(
    `Push start · device ${opts.deviceId ?? "none"} · link ${
      isRealLink(opts.deviceId) ? "live" : "not live (simulated or missing)"
    }`,
  );

  const slots = buildTimerSlots(opts.schedule, opts.intensity, opts.custom ?? null);
  const routineNames = scheduleToBlocks(opts.schedule).map((block) => routineName(block));

  try {
    // Best-effort read, only to reuse the timer IDs the hardware already holds:
    // pushing fresh IDs can make the firmware keep its old working modes next to
    // ours. This is a read (0x08) — it does not beep, and a failure is harmless
    // because every slot is rewritten below regardless.
    const existing = await queryTimers(opts.deviceId, log).catch((error: unknown) => {
      log(`Step “read current routines (0x08)” failed — ${describeError(error)}`);
      return null;
    });
    if (existing?.length) {
      for (const slot of slots) {
        const match = existing.find((s) => s.index === slot.index);
        if (match?.timerId) slot.timerId = match.timerId;
      }
    }

    // Authoritative save: every one of the 5 hardware slots is written on each
    // save. Slots the user did not define are written as disabled, so routines
    // removed here (or added by another phone) can never keep running. Disabled
    // slots carry a valid payload (full week, 1-minute window, current spray
    // timing) instead of zeros, which some firmware revisions reject.
    const disabledPayload = (slot: TimerSlot): TimerSlot =>
      slot.enabled
        ? slot
        : { ...slot, weekdayMask: 0x7f, startMinute: 0, endMinute: 1 };

    log(
      `Writing all 5 slots · ${slots.filter((s) => s.enabled).length} active routine(s), ${
        slots.filter((s) => !s.enabled).length
      } turned off`,
    );

    // 0x13 only confirms receipt on this firmware and can leave the persisted
    // list unchanged. Write each slot with the persistent 0x14 command. The
    // transport serializes the packets; the pause lets flash settle before the
    // next slot without creating an automatic retry burst.
    await wait(500);
    const acks = [];
    for (const slot of slots) {
      const label = routineNames[slot.index - 1] ?? `Routine ${slot.index}`;
      const action = slot.enabled ? `save ${label}` : `turn off unused routine slot ${slot.index}`;
      log(
        slot.enabled
          ? `Writing slot #${slot.index} (${label}) with persistent command 0x14`
          : `Turning off slot #${slot.index} with persistent command 0x14`,
      );
      try {
        const [ack] = await sendFrames(opts.deviceId, [buildModifyTimer(disabledPayload(slot))], log);
        if (ack) acks.push(ack);
        // A silent reply is normal on this firmware (some modules answer
        // nothing and simply beep). Only a failed write means the routine did
        // not reach the diffuser.
        if (!ack?.acked) log(`Slot #${slot.index} answered silently — treated as written`);
      } catch (error) {
        throw new Error(
          `Step “${action} with command 0x14” failed — ${describeError(
            error,
          )} Make sure the diffuser is still paired, then try again.`,
        );
      }
      await wait(700);
    }

    // Each 0x14 acknowledgment and beep confirms that routine. Do not send a
    // final 0x08 query: on this firmware, traffic immediately after the last
    // persistent write can make the Bluetooth module drop its connection.
    const activeCount = slots.filter((slot) => slot.enabled).length;
    log(
      `Save complete · ${activeCount} active routine${
        activeCount === 1 ? "" : "s"
      } written · ${5 - activeCount} slot(s) turned off`,
    );
    return acks;

  } catch (error) {
    // Always report the failing step plus what happened just before it, so a
    // failure on a phone can be diagnosed without the debug strip.
    const message = (error as Error).message || describeError(error);
    const context = trail.slice(-3).join("\n· ");
    const full = context ? `${message}\n\nWhat happened:\n· ${context}` : message;
    debug.setLinkError(full);
    for (const key of ["modes", "intensity", "schedule"] as const) {
      debug.set(key, "fail", full);
    }
    throw new Error(full, { cause: error });
  }
}

/** Human-readable reason for any thrown value, including its underlying cause. */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as { cause?: unknown }).cause;
  const causeText =
    cause instanceof Error
      ? ` (cause: ${cause.name}: ${cause.message})`
      : cause
        ? ` (cause: ${String(cause)})`
        : "";
  return `${error.name}: ${error.message}${causeText}`;
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
