/**
 * Central Bluetooth trace log.
 *
 * Every protocol command, chunk write, notification and liveness check goes
 * through here, so a failure on a phone (where no console is available) can be
 * read back from the debug strip or from the error message itself.
 */
import { pushDebug } from "@/stores/pushDebugStore";

let startedAt = Date.now();
const buffer: string[] = [];
const MAX = 400;

/** Restarts the relative clock used in trace timestamps. */
export function resetTrace() {
  startedAt = Date.now();
  buffer.length = 0;
}

/** Appends one timestamped line to the trace (console + debug strip). */
export function trace(line: string) {
  const stamp = `${String(Date.now() - startedAt).padStart(5, " ")}ms`;
  const entry = `${stamp} ${line}`;
  buffer.push(entry);
  if (buffer.length > MAX) buffer.shift();
  console.info("[BLE]", entry);
  try {
    pushDebug().addLog(entry);
  } catch {
    // Store may not exist yet (module init) — the console line is enough.
  }
}

/** The last `count` trace lines, newest last. */
export function recentTrace(count = 12) {
  return buffer.slice(-count);
}

/** The full trace, for copying out of the debug strip. */
export function fullTrace() {
  return buffer.slice();
}

/**
 * Runs an async step, logging its start, duration and outcome. Failures are
 * re-thrown unchanged so callers keep their own error handling.
 */
export async function traced<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const begun = Date.now();
  trace(`▶ ${label}`);
  try {
    const result = await fn();
    trace(`✔ ${label} (${Date.now() - begun}ms)`);
    return result;
  } catch (error) {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    trace(`✖ ${label} (${Date.now() - begun}ms) — ${reason}`);
    throw error;
  }
}
