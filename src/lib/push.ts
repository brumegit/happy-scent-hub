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
    // Reuse the timer IDs the hardware already holds: pushing fresh IDs makes
    // the firmware keep its old working modes (with their old hours) alongside
    // ours. This is a read (0x08) — it does not make the device beep.
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

    // A first read can be missed while iOS finishes enabling notifications.
    // It is only an optimisation for preserving IDs: if unavailable, write all
    // five slots, including explicit disabled entries for unused routines.
    // Always write every routine the user asked for: comparing with the read
    // list once made the app skip all writes and report success with no beep.
    // If the initial read failed, we cannot assume an absent disabled slot is
    // already clear. Send all five slots so routines removed in the app cannot
    // remain enabled on the diffuser. When a read did succeed, avoid redundant
    // clear commands for slots the hardware already reports as disabled.
    const changed = slots.filter((slot) =>
      existing === null ? true : slot.enabled || !slotMatches(existing, slot),
    );
    log(
      changed.length
        ? `Writing timer slots: ${changed.map((slot) => `#${slot.index}`).join(", ")} (${
            slots.filter((s) => s.enabled).length
          } active routine(s))`
        : "No active routine to write and nothing to clear on the diffuser",
    );

    // 0x13 only confirms receipt on this firmware and can leave the persisted
    // list unchanged. Write each changed slot with the persistent 0x14 command.
    // The transport serializes the packets; this pause lets flash settle before
    // the next slot without creating an automatic retry burst.
    await wait(500);
    const acks = [];
    for (const slot of changed) {
      const label = routineNames[slot.index - 1] ?? `Routine ${slot.index}`;
      const action = slot.enabled ? `save ${label}` : `clear unused routine slot ${slot.index}`;
      log(
        slot.enabled
          ? `Writing slot #${slot.index} (${label}) with persistent command 0x14`
          : `Clearing unused slot #${slot.index} with persistent command 0x14`,
      );
      try {
        const [ack] = await sendFrames(opts.deviceId, [buildModifyTimer(slot)], log);
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
    const activeCount = changed.filter((slot) => slot.enabled).length;
    const clearedCount = changed.length - activeCount;
    log(
      `Save complete · ${activeCount} active routine${activeCount === 1 ? "" : "s"} written${
        clearedCount ? ` · ${clearedCount} unused slot${clearedCount === 1 ? "" : "s"} cleared` : ""
      }`,
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
