import { isRealLink, queryTimers, sendFrames } from "@/lib/bluetooth";
import {
  buildModifyTimer,
  type TimerSlot,
} from "@/lib/scentlife";


import {
  buildTimerSlots,
  intensityFromTimer,
  scheduleFromTimers,
  MAX_TIMERS,
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
        throw new Error(`The diffuser did not accept time block ${slot.index}. Reconnect and try again.`);
      }
      await wait(700);
    }

    await wait(900);
    const readback = await queryTimers(opts.deviceId, log);
    if (!readback) {
      throw new Error("The diffuser did not confirm the saved routine. Reconnect and try again.");
    }

    const saved = matches(readback, slots);
    log(
      `Final read-back ${saved ? "matches" : "differs from"} the requested routine · device modes: ${
        readback
          .map((s) => `#${s.index}${s.enabled ? "" : "(off)"} ${s.startMinute}-${s.endMinute} ${s.onSeconds}/${s.offSeconds}`)
          .join(" | ") || "none"
      }`,
    );
    verify(readback, slots);
    if (!saved) {
      throw new Error("The diffuser did not save the new routine. Reconnect and try again.");
    }
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

/** True when the device's persisted modes already match what we want to push. */
function matches(readback: TimerSlot[], wanted: TimerSlot[]) {
  return wanted.every((w) => slotMatches(readback, w));
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
