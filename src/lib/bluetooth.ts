/**
 * Web Bluetooth transport for the ScentLife serial protocol.
 *
 * The diffuser exposes the protocol over a transparent serial GATT service.
 * Frames are written in 20-byte chunks (default BLE MTU) — larger single writes
 * are silently dropped by these serial modules, which is why the device never
 * beeps when a whole timer-list frame is written at once.
 */
import {
  buildGetTimers,
  buildQuery,
  buildReportAck,
  isStatusReport,
  parseBatteryReport,
  parseTimerListResponse,
  toHex,
  type BatteryStatus,
  type TimerSlot,
} from "@/lib/scentlife";
import { pushDebug } from "@/stores/pushDebugStore";
import { describeError, trace } from "@/lib/ble-log";
import {
  connectNative,
  forgetNativeSession,
  isBluetoothEnabled as nativeBluetoothEnabled,
  isNativeConnected,
  isNativeSessionConnected,
  isNativePlatform,
  isNativeSync,
  requestNativeDevice,
  subscribeNativeDisconnect,
  writeNative,
  type DeviceChooser,
} from "@/lib/native-ble";


export type PairedDevice = { deviceId: string; suggestedName: string };

/** Common transparent-serial services used by ScentLife modules. */
const SERVICE_UUIDS = [
  0xffe0,
  0xffe5,
  0xfff0,
  0xfee7,
  0xfd00,
  0xae00,
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // Microchip transparent UART
  "0000ffe5-0000-1000-8000-00805f9b34fb",
];

const CHUNK_SIZE = 20;
// Keep multi-packet protocol frames inside the UART bridge's assembly window.
const CHUNK_DELAY_MS = 30;

type Link = {
  write: (frame: Uint8Array) => Promise<void>;
  request: (frame: Uint8Array, responseFn: number) => Promise<Uint8Array>;
  /** Waits for a reply with the given function code (used for batched writes). */
  waitFor?: (fn: number) => Promise<Uint8Array>;
  simulated: boolean;
  /** Native write-without-response completes without a protocol reply. */
  routineRepliesExpected?: boolean;
  /** True while the physical link is still up. */
  isLive?: () => Promise<boolean>;
  /** Reopens the same physical link after the OS reported a disconnect. */
  reconnect?: () => Promise<boolean>;
};

/** Prevents status replies and user actions from interleaving BLE packets. */
function serializeWrites(writeNow: (frame: Uint8Array) => Promise<void>) {
  let tail = Promise.resolve();
  return (frame: Uint8Array) => {
    const operation = tail.then(() => writeNow(frame));
    tail = operation.catch(() => undefined);
    return operation;
  };
}

const links = new Map<string, Link>();
const connectionListeners = new Set<(deviceId: string, connected: boolean) => void>();
const lastStatusFrames = new Map<string, { signature: string; receivedAt: number }>();

function publishConnection(deviceId: string, connected: boolean) {
  connectionListeners.forEach((listener) => listener(deviceId, connected));
}

/** React screens use this in addition to polling so disconnects appear immediately. */
export function subscribeConnection(listener: (deviceId: string, connected: boolean) => void) {
  connectionListeners.add(listener);
  const unsubscribeNative = subscribeNativeDisconnect((deviceId) => publishConnection(deviceId, false));
  return () => {
    connectionListeners.delete(listener);
    unsubscribeNative();
  };
}

/** Last battery reading pushed by each device (the protocol has no read command). */
const batteries = new Map<string, BatteryStatus>();
const batteryListeners = new Set<() => void>();

function captureBattery(deviceId: string, frame: Uint8Array) {
  // Status reports must be acknowledged, otherwise the module stops sending
  // them and the battery level never refreshes.
  const fn = frame[3] ?? 0;
  const signature = toHex(frame);
  const previous = lastStatusFrames.get(deviceId);
  const receivedAt = Date.now();
  // A reconnect can briefly leave the previous CoreBluetooth notification
  // callback alive. Ignore the duplicate delivery so one status report creates
  // exactly one 0xA1 acknowledgment instead of two back-to-back writes.
  if (previous?.signature === signature && receivedAt - previous.receivedAt < 300) {
    trace(`duplicate RX fn=0x${fn.toString(16).padStart(2, "0")} ignored`);
    return;
  }
  lastStatusFrames.set(deviceId, { signature, receivedAt });
  pushDebug().addLog(`RX fn=0x${fn.toString(16).padStart(2, "0")} ${toHex(frame)}`);
  if (isStatusReport(fn)) {
    void links
      .get(deviceId)
      ?.write(buildReportAck(fn))
      .catch(() => {});
  }
  const status = parseBatteryReport(frame);
  if (!status) return;
  pushDebug().addLog(`Battery ${status.percent}%`);
  batteries.set(deviceId, status);
  batteryListeners.forEach((listener) => listener());
}

/** Last known battery status for a device, or null when it has not reported yet. */
export function getBatteryStatus(deviceId: string | null): BatteryStatus | null {
  return (deviceId && batteries.get(deviceId)) || null;
}

/** Subscribes to battery updates; returns an unsubscribe function. */
export function subscribeBattery(listener: () => void) {
  batteryListeners.add(listener);
  return () => {
    batteryListeners.delete(listener);
  };
}

/**
 * Polls the module so it emits a runtime status report (which carries the
 * battery percentage). The query command is silent — the diffuser does not beep.
 * Different firmware revisions answer different query sub-types, so we probe
 * the documented ones in sequence and keep whichever replies.
 */
export async function requestBattery(deviceId: string | null) {
  const link = deviceId ? links.get(deviceId) : undefined;
  if (!link || link.simulated) return;
  if (isTrafficBlocked(deviceId)) {
    trace("battery query skipped while command traffic is protected");
    return;
  }
  for (const subType of [0x01, 0x02, 0x03]) {
    try {
      pushDebug().addLog(`TX query 0x09 type=0x0${subType}`);
      await link.write(buildQuery(subType));
      await wait(250);
    } catch {
      // Link dropped — the connection poll will surface it.
      return;
    }
  }
}


const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));


function createResponseChannel(onFrame?: (frame: Uint8Array) => void) {
  let buffer = new Uint8Array();
  const pending: { fn: number; resolve: (frame: Uint8Array) => void }[] = [];

  const receive = (chunk: Uint8Array) => {
    const joined = new Uint8Array(buffer.length + chunk.length);
    joined.set(buffer);
    joined.set(chunk, buffer.length);
    buffer = joined;
    while (buffer.length >= 6) {
      const start = buffer.findIndex((byte, index) => byte === 0x55 && buffer[index + 1] === 0xaa);
      if (start < 0) {
        buffer = new Uint8Array();
        return;
      }
      if (start > 0) buffer = buffer.slice(start);
      const frameLength = (buffer[2] ?? 0) + 5;
      if (buffer.length < frameLength) return;
      const frame = buffer.slice(0, frameLength);
      buffer = buffer.slice(frameLength);
      console.info("[ScentLife] RX", toHex(frame));
      onFrame?.(frame);
      const waiterIndex = pending.findIndex((entry) => entry.fn === frame[3]);
      if (waiterIndex >= 0) pending.splice(waiterIndex, 1)[0]?.resolve(frame);
    }
  };

  const waitFor = (fn: number, timeoutMs = 1200) =>
    new Promise<Uint8Array>((resolve, reject) => {
      const entry = { fn, resolve };
      pending.push(entry);
      setTimeout(() => {
        const index = pending.indexOf(entry);
        if (index >= 0) {
          pending.splice(index, 1);
          reject(new Error("The diffuser did not confirm the change. Reconnect and try again."));
        }
      }, timeoutMs);
    });

  return { receive, waitFor };
}

export function isBluetoothSupported() {
  // The native shell has no Web Bluetooth API — it pairs through the Capacitor
  // BLE plugin instead, so it must still report as supported.
  if (isNativeSync()) return true;
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

/**
 * Reports whether Bluetooth is currently switched on (adapter powered), so the
 * UI can warn the user before they try to pair. Safe to call on mount.
 */
export async function isBluetoothOn(): Promise<boolean> {
  return nativeBluetoothEnabled();
}

/** True when frames are actually going out over a real GATT link. */
export function isRealLink(deviceId: string | null) {
  return !!deviceId && links.get(deviceId)?.simulated === false;
}

type Char = {
  properties?: { write?: boolean; writeWithoutResponse?: boolean; notify?: boolean };
  writeValue?: (v: Uint8Array) => Promise<void>;
  writeValueWithResponse?: (v: Uint8Array) => Promise<void>;
  writeValueWithoutResponse?: (v: Uint8Array) => Promise<void>;
  startNotifications?: () => Promise<unknown>;
  addEventListener?: (type: string, cb: (e: Event) => void) => void;
};

type BluetoothLike = {
  requestDevice: (opts: unknown) => Promise<{
    id: string;
    name?: string;
    gatt?: {
      connected?: boolean;
      connect: () => Promise<{
        getPrimaryServices: () => Promise<{ getCharacteristics: () => Promise<Char[]> }[]>;
      }>;
    };
    addEventListener?: (type: string, cb: () => void) => void;
  }>;
};

async function attachLink(device: {
  id: string;
  addEventListener?: (type: string, cb: () => void) => void;
  gatt?: {
    connected?: boolean;
    connect: () => Promise<{ getPrimaryServices: () => Promise<{ getCharacteristics: () => Promise<Char[]> }[]> }>;
  };
}) {
  const log = (line: string) => {
    console.info("[ScentLife]", line);
    pushDebug().addLog(line);
  };
  const server = await device.gatt?.connect();
  if (!server) {
    log("GATT connect returned no server");
    return false;
  }
  device.addEventListener?.("gattserverdisconnected", () => publishConnection(device.id, false));
  const services = await server.getPrimaryServices().catch((error: Error) => {
    log(`getPrimaryServices failed: ${error.message}`);
    return [] as { getCharacteristics: () => Promise<Char[]> }[];
  });
  log(`GATT connected · ${services.length} accessible service(s)`);
  const responses = createResponseChannel((frame) => captureBattery(device.id, frame));

  let writable: Char | undefined;
  let writableWithNotify: Char | undefined;
  for (const service of services) {
    const characteristics = await service.getCharacteristics().catch((error: Error) => {
      log(`getCharacteristics failed: ${error.message}`);
      return [] as Char[];
    });
    log(
      `service chars: ${characteristics
        .map(
          (c) =>
            `${c.properties?.notify ? "N" : ""}${c.properties?.write ? "W" : ""}${
              c.properties?.writeWithoutResponse ? "w" : ""
            }` || "-",
        )
        .join(" ")}`,
    );

    // Subscribe to the notify characteristic so acknowledgments are visible.
    const notify = characteristics.find((c) => c.properties?.notify);
    if (notify?.startNotifications) {
      try {
        await notify.startNotifications();
        notify.addEventListener?.("characteristicvaluechanged", (event) => {
          const value = (event.target as unknown as { value?: DataView }).value;
          if (value) {
            responses.receive(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
          }
        });
      } catch {
        // Notifications are optional.
      }
    }

    const write = characteristics.find(
      (c) => c.properties?.writeWithoutResponse || c.properties?.write,
    );
    // Prefer the write characteristic that lives in the same service as the
    // notify one — that pair is the transparent serial channel.
    if (notify && write) writableWithNotify = writableWithNotify ?? write;
    writable = writable ?? write;
  }

  writable = writableWithNotify ?? writable;
  if (!writable) {
    log("No writable characteristic found — cannot send commands");
    return false;
  }
  log("Serial channel ready");


  const write = serializeWrites(async (frame: Uint8Array) => {
    const chunks = Math.ceil(frame.length / CHUNK_SIZE);
    trace(`web write start · ${frame.length}B in ${chunks} chunk(s)`);
    for (let offset = 0; offset < frame.length; offset += CHUNK_SIZE) {
      const chunk = frame.slice(offset, offset + CHUNK_SIZE);
      try {
        if (writable.properties?.writeWithoutResponse && writable.writeValueWithoutResponse) {
          await writable.writeValueWithoutResponse(chunk);
        } else if (writable.writeValueWithResponse) {
          await writable.writeValueWithResponse(chunk);
        } else {
          await writable.writeValue?.(chunk);
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        trace(`web write FAILED: ${reason}`);
        throw new BleWriteError(reason);
      }
      await wait(CHUNK_DELAY_MS);
    }
    trace("web write complete");
  });
  links.set(device.id, {
    simulated: false,
    write,
    request: async (frame, responseFn) => {
      const response = responses.waitFor(responseFn);
      await write(frame);
      return response;
    },
    waitFor: (fn) => responses.waitFor(fn, 2500),
    isLive: async () => {
      if (device.gatt?.connected === false) return false;
      try {
        // `gatt.connected` is cached by Chrome and can remain true after the
        // diffuser disappears. A service request forces a real GATT operation,
        // making the five-second screen check detect a dead link.
        await server.getPrimaryServices();
        return true;
      } catch {
        return false;
      }
    },
    reconnect: async () => {
      trace("web reconnect: reopening GATT session");
      return await attachLink(device).catch(() => false);
    },
  });
  publishConnection(device.id, true);
  return true;
}

/**
 * Connects to a device the user (or the auto-match) selected in the picker and
 * registers its transport link.
 */
export async function connectPickedDevice(device: {
  deviceId: string;
  name?: string;
}): Promise<PairedDevice> {
  const responses = createResponseChannel((frame) => captureBattery(device.deviceId, frame));
  const target = await connectNative(device.deviceId, (value) => responses.receive(value));
  if (target) {
    const write = serializeWrites(async (frame: Uint8Array) => {
      const chunks = Math.ceil(frame.length / CHUNK_SIZE);
      trace(`native write start · ${frame.length}B in ${chunks} chunk(s)`);
      for (let offset = 0; offset < frame.length; offset += CHUNK_SIZE) {
        const index = Math.floor(offset / CHUNK_SIZE) + 1;
        try {
          await writeNative(device.deviceId, target, frame.slice(offset, offset + CHUNK_SIZE));
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          trace(`native write FAILED on chunk ${index}/${chunks}: ${reason}`);
          throw new BleWriteError(reason);
        }
        await wait(CHUNK_DELAY_MS);
      }
      trace("native write complete");
    });
    links.set(device.deviceId, {
      simulated: false,
      routineRepliesExpected: false,
      write,
      request: async (frame, responseFn) => {
        // CoreBluetooth can deliver the first notification slowly immediately
        // after subscribing, especially during a fresh onboarding connection.
        const response = responses.waitFor(responseFn, 4000);
        await write(frame);
        return response;
      },
      waitFor: (fn) => responses.waitFor(fn, 4000),
      // UI checks must remain passive on iPhone. A bridge-level getMtu probe
      // can collide with the diffuser's serial session during a screen change.
      isLive: async () => isNativeSessionConnected(device.deviceId),
      reconnect: async () => {
        trace("native reconnect: reopening the diffuser session");
        // The cached CoreBluetooth channel is what just failed, so discard it
        // first — otherwise the connect call short-circuits as "already live"
        // and the retry writes into the same dead session.
        forgetNativeSession(device.deviceId);
        await connectPickedDevice({ deviceId: device.deviceId, ...(device.name ? { name: device.name } : {}) });
        return isNativeSessionConnected(device.deviceId);
      },
    });
    publishConnection(device.deviceId, true);
  }
  return { deviceId: device.deviceId, suggestedName: device.name || "The 24/7 Room Diffuser" };
}

export async function pairDiffuser(choose?: DeviceChooser): Promise<PairedDevice> {
  // Native iOS / Android build: scan natively but present our own list so
  // nameless peripherals never reach the user.
  if (await isNativePlatform()) {
    const found = await requestNativeDevice(choose).catch((error: unknown) => {
      throw error instanceof Error
        ? error
        : new Error("Bluetooth scan failed. Check that Bluetooth is on and try again.");
    });
    return connectPickedDevice(found);
  }



  if (isBluetoothSupported()) {
    const nav = navigator as unknown as { bluetooth: BluetoothLike };
    try {
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: SERVICE_UUIDS,
      });

      let attached = false;
      try {
        attached = await attachLink(device);
      } catch (gattError) {
        pushDebug().addLog(`GATT setup failed: ${(gattError as Error).message}`);
      }

      const suggested = device.name || "The 24/7 Room Diffuser";
      if (!attached) {
        // Without a writable serial channel nothing can be pushed — say so now
        // instead of failing silently at the schedule step.
        throw new Error(
          "Connected, but this device did not expose its settings channel. Turn the diffuser off and on, then pair again.",
        );
      }
      return { deviceId: device.id, suggestedName: suggested };
    } catch (error) {
      const err = error as Error;
      pushDebug().addLog(`Pairing error: ${err.name ?? "Error"} — ${err.message}`);
      if (err?.name === "NotFoundError") {
        throw new Error("No device selected.\nDouble-tap the button and try again.");
      }
      throw err;
    }
  }

  await wait(2200);
  const deviceId = `sim-${Math.random().toString(36).slice(2, 10)}`;
  links.set(deviceId, {
    simulated: true,
    write: async (frame) => {
      console.info("[ScentLife] TX (simulated)", toHex(frame));
      await wait(120);
    },
    request: async () => {
      throw new Error("A real Bluetooth connection is required.");
    },
  });
  return {
    deviceId,
    suggestedName: "The 24/7 Room Diffuser",
  };
}

/**
 * Raised when the bytes could not even leave the phone (the OS refused the
 * write). This is very different from a missing reply: nothing reached the
 * diffuser, so the routine was definitely not saved.
 */
export class BleWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BleWriteError";
  }
}

export type FrameAck = {
  /** Function code of the command that was sent. */
  fn: number;
  /** True when the module replied with fn + 0x80. */
  acked: boolean;
  /** Status byte of the acknowledgment (0 = success), null when silent. */
  code: number | null;
  hex: string;
};

/**
 * Sends complete protocol commands without issuing a follow-up read. A passive
 * acknowledgment is enough to confirm that the routine reached the diffuser.
 */
export async function sendWithoutReadback(
  deviceId: string | null,
  frames: Uint8Array[],
  onLog?: (line: string) => void,
): Promise<void> {
  const link = deviceId ? links.get(deviceId) : undefined;
  if (!link || link.simulated) {
    throw new Error("Diffuser is not connected. Reconnect over Bluetooth and try again.");
  }
  if (link.isLive && !(await link.isLive())) {
    throw new Error("Bluetooth link lost. Reconnect the diffuser and try again.");
  }

  for (const frame of frames) {
    const hex = toHex(frame);
    const fn = frame[3] ?? 0;
    console.info("[ScentLife] TX", hex);
    onLog?.(`TX ${hex}`);
    const confirmation = link.waitFor
      ? link.waitFor((fn + 0x80) & 0xff).catch(() => null)
      : Promise.resolve<Uint8Array | null>(null);
    await link.write(frame);
    onLog?.("Write complete");
    const response = await confirmation;
    if (response) onLog?.(`RX ${toHex(response)}`);
    const code = response && response.length >= 6 ? (response[4] ?? 0) : 0;
    if (response && response.length === 7 && code !== 0) {
      throw new Error(`The diffuser rejected the routine (error ${code}).`);
    }
  }
}

/**
 * Sends protocol frames to the diffuser, one at a time with a gap so the module
 * has time to parse and acknowledge each frame (the device beeps per accepted
 * command). Returns the per-command acknowledgments so callers can report what
 * the hardware actually confirmed.
 */
export async function sendFrames(
  deviceId: string | null,
  frames: Uint8Array[],
  onLog?: (line: string) => void,
): Promise<FrameAck[]> {
  let link = deviceId ? links.get(deviceId) : undefined;
  if (!link || link.simulated) {
    trace("sendFrames aborted: no live link registered for this device");
    throw new Error("Diffuser is not connected. Reconnect over Bluetooth and try again.");
  }
  // pushSettings performs one real connection check before beginning its
  // protected command sequence. Do not repeat native bridge checks between
  // routine slots while that sequence is active.
  if (!isTrafficBlocked(deviceId) && !link.simulated && link.isLive && !(await link.isLive().catch(() => false))) {
    trace("sendFrames: link down before sending — attempting one automatic reconnect");
    onLog?.("Bluetooth link dropped — reconnecting");
    const recovered = await reopenLink(deviceId);
    if (!recovered) {
      throw new Error("Bluetooth link lost. Double tap the diffuser button, reconnect, and try again.");
    }
    link = links.get(deviceId!) ?? link;
  }

  // One frame per command. Routine saves currently call this once for each of
  // the five authoritative 0x14 hardware slots.
  const acks: FrameAck[] = [];
  for (const frame of frames) {
    const hex = toHex(frame);
    const fn = frame[3] ?? 0;
    markCommandTraffic(deviceId);
    trace(`TX 0x${fn.toString(16)} · ${hex}`);
    onLog?.(`TX ${hex}`);
    const begun = Date.now();
    let response: Uint8Array | null = null;
    try {
      if (link.routineRepliesExpected === false) {
        // iOS uses CoreBluetooth's write-without-response path. The plugin
        // resolves as soon as CoreBluetooth accepts the bytes, and this diffuser
        // does not notify a 0x94 reply. Waiting four seconds for one after every
        // slot leaves the connection idle long enough for the peripheral to
        // sleep mid-save. Keep the five writes contiguous instead.
        await link.write(frame);
        trace(`native 0x${fn.toString(16)} write complete · no reply expected`);
        onLog?.(`Write complete for 0x${fn.toString(16)}`);
      } else {
        response = await link.request(frame, (fn + 0x80) & 0xff);
        trace(`RX 0x${fn.toString(16)} after ${Date.now() - begun}ms · ${toHex(response)}`);
        onLog?.(`RX ${toHex(response)}`);
      }
    } catch (error) {
      response = null;
      const reason = error instanceof Error ? error.message : String(error);
      if (error instanceof BleWriteError) {
        // The operating system refused the bytes because the link is gone. The
        // command never reached the diffuser, so reopening the session and
        // sending it once more cannot duplicate a routine.
        trace(`write refused by the OS for 0x${fn.toString(16)}: ${reason} — reconnecting once`);
        onLog?.("Bluetooth link dropped — reconnecting");
        const recovered = await reopenLink(deviceId);
        link = (deviceId ? links.get(deviceId) : undefined) ?? link;
        if (!recovered) {
          throw new Error(
            `Bluetooth link lost while sending command 0x${fn.toString(16)} (${reason}).\nDouble tap the diffuser button, reconnect, and try again.`,
          );
        }
        try {
          markCommandTraffic(deviceId);
          trace(`retrying 0x${fn.toString(16)} after reconnect`);
          if (link.routineRepliesExpected === false) {
            await link.write(frame);
          } else {
            response = await link.request(frame, (fn + 0x80) & 0xff);
          }
          trace(`retry of 0x${fn.toString(16)} succeeded after reconnect`);
        } catch (retryError) {
          const retryReason = retryError instanceof Error ? retryError.message : String(retryError);
          trace(`retry of 0x${fn.toString(16)} failed: ${retryReason}`);
          throw new Error(
            `Bluetooth link lost while sending command 0x${fn.toString(16)} (${retryReason}).\nDouble tap the diffuser button, reconnect, and try again.`,
          );
        }
      } else {
        // Some modules acknowledge silently (no notify characteristic).
        trace(`no RX for 0x${fn.toString(16)} after ${Date.now() - begun}ms (${reason})`);
        onLog?.(`RX none for 0x${fn.toString(16)}`);
      }
    }
    const code = response && response.length >= 6 ? (response[4] ?? null) : null;
    acks.push({ fn, acked: !!response, code, hex });
    // Not every module uses byte 4 as a status code (some return the timer id),
    // so a non-zero byte is logged but never treated as a refusal here. The
    // caller decides; a real refusal shows up as a transport/write failure.
    if (code) onLog?.(`Reply status byte for 0x${fn.toString(16)}: ${code}`);
    await wait(200);
  }

  // No liveness probe or other traffic after the final frame, and the keepalive
  // stays silent for the quiet window so the module can commit to flash.
  markCommandTraffic(deviceId);
  return acks;
}

/**
 * Reopens the diffuser session after the operating system reported the link is
 * gone. Only ever called once per failure, and never while a link is still up,
 * so it cannot interrupt a diffuser that is committing routines.
 */
let reopening: Promise<boolean> | null = null;
export async function reopenLink(deviceId: string | null): Promise<boolean> {
  if (!deviceId) return false;
  if (reopening) return reopening;
  const link = links.get(deviceId);
  if (!link?.reconnect) {
    trace("auto-reconnect unavailable for this link");
    return false;
  }
  reopening = (async () => {
    const begun = Date.now();
    try {
      const ok = await link.reconnect!();
      trace(`auto-reconnect ${ok ? "succeeded" : "failed"} after ${Date.now() - begun}ms`);
      if (ok) publishConnection(deviceId, true);
      return ok;
    } catch (error) {
      trace(`auto-reconnect failed after ${Date.now() - begun}ms · ${describeError(error)}`);
      return false;
    } finally {
      reopening = null;
    }
  })();
  return reopening;
}

/**
 * Observes whether the existing link is usable before any command is sent, and
 * reopens it once when the operating system says it dropped.
 */
export async function ensureLink(
  deviceId: string | null,
  onLog?: (line: string) => void,
): Promise<boolean> {
  if (!deviceId) return false;
  const link = links.get(deviceId);
  if (link?.simulated) return true;
  // This is the single real check per save: the passive in-memory flag can
  // still say "live" seconds after iOS has already discarded the session.
  const live = isNativeSync()
    ? await isNativeConnected(deviceId).catch(() => false)
    : link?.isLive
      ? await link.isLive().catch(() => false)
      : !!link;
  if (live) {
    trace("link check before sending: live");
    return true;
  }
  trace("link check before sending: down — attempting one automatic reconnect");
  onLog?.("Bluetooth link dropped — reconnecting");
  const recovered = await reopenLink(deviceId);
  if (recovered) {
    onLog?.("Reconnected");
    return true;
  }
  onLog?.("Bluetooth link is not live");
  return false;
}

/**
 * Writes protocol frames as one continuous stream and collects acknowledgments.
 * The diffuser signals each protocol command, regardless of BLE write count;
 * callers that require one confirmation sound must pass exactly one frame.
 */
export async function sendBatch(
  deviceId: string | null,
  frames: Uint8Array[],
  onLog?: (line: string) => void,
): Promise<FrameAck[]> {
  const link = deviceId ? links.get(deviceId) : undefined;
  if (!link || link.simulated) {
    throw new Error("Diffuser is not connected. Reconnect over Bluetooth and try again.");
  }
  if (link.isLive && !(await link.isLive())) {
    throw new Error("Bluetooth link lost. Reconnect the diffuser and try again.");
  }

  const fns = frames.map((frame) => frame[3] ?? 0);
  const waiters = fns.map((fn) =>
    link.waitFor ? link.waitFor((fn + 0x80) & 0xff).catch(() => null) : Promise.resolve(null),
  );

  // Concatenate before transport chunking so frame bytes remain contiguous.
  const total = frames.reduce((sum, frame) => sum + frame.length, 0);
  const stream = new Uint8Array(total);
  let offset = 0;
  for (const frame of frames) {
    const hex = toHex(frame);
    console.info("[ScentLife] TX", hex);
    onLog?.(`TX ${hex}`);
    stream.set(frame, offset);
    offset += frame.length;
  }
  await link.write(stream);


  const responses = await Promise.all(waiters);
  const acks: FrameAck[] = frames.map((frame, index) => {
    const response = responses[index] ?? null;
    if (response) onLog?.(`RX ${toHex(response)}`);
    else onLog?.(`RX none for 0x${(fns[index] ?? 0).toString(16)}`);
    return {
      fn: fns[index] ?? 0,
      acked: !!response,
      code: response && response.length >= 6 ? (response[4] ?? null) : null,
      hex: toHex(frame),
    };
  });

  if (link.isLive && !(await link.isLive())) {
    throw new Error("Bluetooth link lost while sending. Reconnect the diffuser and try again.");
  }
  return acks;
}

/**
 * Reads the timers (working modes) persisted on the device — used to verify a
 * push actually landed instead of trusting the acknowledgment alone.
 */
export async function queryTimers(
  deviceId: string | null,
  onLog?: (line: string) => void,
): Promise<TimerSlot[] | null> {
  const link = deviceId ? links.get(deviceId) : undefined;
  if (!link || link.simulated) return null;
  if (isTrafficBlocked(deviceId)) {
    trace("read routines skipped while command traffic is protected");
    return null;
  }
  try {
    const frame = buildGetTimers();
    trace(`TX 0x08 (read routines) · ${toHex(frame)}`);
    onLog?.(`TX ${toHex(frame)}`);
    const response = await link.request(frame, 0x88);
    trace(`RX 0x88 · ${toHex(response)}`);
    onLog?.(`RX ${toHex(response)}`);
    return parseTimerListResponse(response);
  } catch (error) {
    trace(`read routines (0x08) failed: ${(error as Error).message}`);
    onLog?.(`Read-back failed: ${(error as Error).message}`);
    return null;
  }
}



type TrafficState = { lastCommandAt: number; saving: boolean };
const trafficByDevice = new Map<string, TrafficState>();
/** Optional reads remain blocked briefly after persistent writes. Normal screen
 * status checks are passive and do not use this command path. */
const QUIET_AFTER_COMMAND_MS = 5_000;
const pingsInFlight = new Map<string, Promise<boolean>>();

function trafficState(deviceId: string) {
  const existing = trafficByDevice.get(deviceId);
  if (existing) return existing;
  const created = { lastCommandAt: 0, saving: false };
  trafficByDevice.set(deviceId, created);
  return created;
}

function isTrafficBlocked(deviceId: string | null) {
  if (!deviceId) return false;
  const state = trafficByDevice.get(deviceId);
  return !!state && (state.saving || Date.now() - state.lastCommandAt < QUIET_AFTER_COMMAND_MS);
}

export function beginCommandSequence(deviceId: string | null) {
  if (!deviceId) return;
  const state = trafficState(deviceId);
  state.saving = true;
  trace("exclusive command sequence started");
}

export function endCommandSequence(deviceId: string | null) {
  if (!deviceId) return;
  const state = trafficState(deviceId);
  state.lastCommandAt = Date.now();
  state.saving = false;
  trace(`exclusive command sequence ended · quiet ${QUIET_AFTER_COMMAND_MS}ms`);
}

export function markCommandTraffic(deviceId: string | null) {
  if (!deviceId) return;
  trafficState(deviceId).lastCommandAt = Date.now();
}

/**
 * Explicit diagnostic keepalive. Normal UI status polling must use
 * checkConnection(), which sends no command to the diffuser.
 */
export async function pingLink(deviceId: string | null): Promise<boolean> {
  if (!deviceId) return false;
  const link = links.get(deviceId);
  if (!link) return false;
  if (link.simulated) return true;
  // Never send anything while a save is active or the diffuser is committing it.
  if (isTrafficBlocked(deviceId)) return true;
  const pending = pingsInFlight.get(deviceId);
  if (pending) return pending;
  const run = (async () => {
    try {
      if (link.isLive && !(await link.isLive().catch(() => false))) {
        trace("keepalive not sent: operating system already reported the link disconnected");
        return false;
      }
      trace("keepalive TX 0x08");
      await link.request(buildGetTimers(), 0x88);
      trace("keepalive RX 0x88");
      return true;
    } catch (error) {
      if (error instanceof BleWriteError) {
        const stillLive = link.isLive ? await link.isLive().catch(() => false) : false;
        trace(
          stillLive
            ? `keepalive write was refused while link still reported live: ${(error as Error).message}`
            : `keepalive found the diffuser already disconnected: ${(error as Error).message}`,
        );
        return false;
      }
      // A silent module still accepted the write, so the link is alive.
      return link.isLive ? await link.isLive().catch(() => false) : true;
    } finally {
      pingsInFlight.delete(deviceId);
    }
  })();
  pingsInFlight.set(deviceId, run);
  return run;
}


/**
 * Async connection check — ask the native session every five seconds instead
 * of trusting the in-memory map, which can remain stale after iOS drops a link.
 */
export async function checkConnection(deviceId: string | null) {
  if (!deviceId) return false;
  if (await isNativePlatform()) {
    // The native disconnect callback is authoritative. Do not call getMtu (or
    // any other GATT operation) from a status poll or CTA transition: this
    // firmware can drop its serial link when that probe overlaps normal use.
    return isNativeSessionConnected(deviceId);
  }
  const link = links.get(deviceId);
  if (!link || link.simulated) return false;
  // Ask the transport whether the physical GATT link is still up: a device that
  // went out of range or was taken over by another phone must not read as
  // connected just because we once paired with it.
  if (link.isLive && !(await link.isLive().catch(() => false))) {
    return false;
  }
  return true;
}

