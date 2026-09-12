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

/**
 * Full detail for an error coming back across the Capacitor bridge. Xcode shows
 * the plugin's raw payload (`{"message":"…","errorMessage":"…","code":"…"}`);
 * the JS side only keeps `message` unless we read the extra fields explicitly.
 */
export function describeError(error: unknown): string {
  if (!error) return "unknown error";
  if (typeof error === "string") return error;
  const bag = error as Record<string, unknown>;
  const parts: string[] = [];
  const message = error instanceof Error ? error.message : (bag["message"] as string | undefined);
  if (message) parts.push(String(message));
  for (const key of ["code", "errorMessage", "name"]) {
    const value = bag[key];
    if (value && String(value) !== message) parts.push(`${key}=${String(value)}`);
  }
  if (!parts.length) {
    try {
      parts.push(JSON.stringify(error));
    } catch {
      parts.push(String(error));
    }
  }
  return parts.join(" · ");
}

let captureInstalled = false;

/**
 * Mirrors the runtime signals Xcode shows (plugin errors, webview warnings,
 * unhandled rejections) into the in-app trace, so a phone-only failure can be
 * read without a Mac attached.
 */
export function installSystemLogCapture() {
  if (captureInstalled || typeof window === "undefined") return;
  captureInstalled = true;

  const mirror = (level: "warn" | "error", original: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      try {
        const text = args
          .map((arg) => (typeof arg === "string" ? arg : describeError(arg)))
          .join(" ");
        if (!text.startsWith("[BLE]")) trace(`⚠ ${level}: ${text.slice(0, 300)}`);
      } catch {
        // Never let logging break the app.
      }
      original(...args);
    };

  console.warn = mirror("warn", console.warn.bind(console));
  console.error = mirror("error", console.error.bind(console));

  window.addEventListener("error", (event) => {
    trace(`⚠ window error: ${event.message}`);
  });
  window.addEventListener("unhandledrejection", (event) => {
    trace(`⚠ unhandled rejection: ${describeError(event.reason)}`);
  });
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
