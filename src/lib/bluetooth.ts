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
import {
  connectNative,
  isBluetoothEnabled as nativeBluetoothEnabled,
  isNativeConnected,
  isNativePlatform,
  isNativeSync,
  requestNativeDevice,
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
// The UART bridge needs time to drain each BLE packet before receiving the
// next one. Routine frames span several packets, especially with 2–3 blocks.
const CHUNK_DELAY_MS = 120;

type Link = {
  write: (frame: Uint8Array) => Promise<void>;
  request: (frame: Uint8Array, responseFn: number) => Promise<Uint8Array>;
  /** Waits for a reply with the given function code (used for batched writes). */
  waitFor?: (fn: number) => Promise<Uint8Array>;
  simulated: boolean;
  /** True while the physical link is still up. */
  isLive?: () => Promise<boolean>;
  /** Drops the physical GATT link (web only; native goes through Capacitor). */
  close?: () => Promise<void>;
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

/** Last battery reading pushed by each device (the protocol has no read command). */
const batteries = new Map<string, BatteryStatus>();
const batteryListeners = new Set<() => void>();

// A routine update must be the only protocol exchange on the wire. Some
// firmware sends a status report as it applies 0x13; acknowledging that report
// creates a hidden second write and can make the diffuser drop an iPhone link.
let isolatedWriteDepth = 0;
let suppressStatusAcksUntil = 0;

async function withIsolatedProtocol<T>(operation: () => Promise<T>): Promise<T> {
  isolatedWriteDepth += 1;
  try {
    return await operation();
  } finally {
    isolatedWriteDepth = Math.max(0, isolatedWriteDepth - 1);
    suppressStatusAcksUntil = Math.max(suppressStatusAcksUntil, Date.now() + 1500);
  }
}

function captureBattery(deviceId: string, frame: Uint8Array) {
  // Status reports must be acknowledged, otherwise the module stops sending
  // them and the battery level never refreshes.
  const fn = frame[3] ?? 0;
  pushDebug().addLog(`RX fn=0x${fn.toString(16).padStart(2, "0")} ${toHex(frame)}`);
  if (isStatusReport(fn)) {
    if (isolatedWriteDepth > 0 || Date.now() < suppressStatusAcksUntil) {
      pushDebug().addLog(`Status acknowledgment paused after routine transfer`);
    } else {
      void links
        .get(deviceId)
        ?.write(buildReportAck(fn))
        .catch(() => {});
    }
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
  await withIsolatedProtocol(async () => {
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
  });
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
  }>;
};

async function attachLink(device: {
  id: string;
  gatt?: {
    connected?: boolean;
    disconnect?: () => void;
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
    for (let offset = 0; offset < frame.length; offset += CHUNK_SIZE) {
      const chunk = frame.slice(offset, offset + CHUNK_SIZE);
      if (writable.properties?.writeWithoutResponse && writable.writeValueWithoutResponse) {
        await writable.writeValueWithoutResponse(chunk);
      } else if (writable.writeValueWithResponse) {
        await writable.writeValueWithResponse(chunk);
      } else {
        await writable.writeValue?.(chunk);
      }
      await wait(CHUNK_DELAY_MS);
    }
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
    isLive: async () => device.gatt?.connected !== false,
    close: async () => {
      // Physically drop the GATT link so the device LED stops showing connected.
      device.gatt?.disconnect?.();
      await wait(150);
    },
  });
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
      for (let offset = 0; offset < frame.length; offset += CHUNK_SIZE) {
        await writeNative(device.deviceId, target, frame.slice(offset, offset + CHUNK_SIZE));
        await wait(CHUNK_DELAY_MS);
      }
    });
    links.set(device.deviceId, {
      simulated: false,
      write,
      request: async (frame, responseFn) => {
        const response = responses.waitFor(responseFn);
        await write(frame);
        return response;
      },
      waitFor: (fn) => responses.waitFor(fn, 2500),
      isLive: () => isNativeConnected(device.deviceId),
    });
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
 * Sends commands without requesting or waiting for a reply. Some diffuser
 * firmware applies routine updates but drops the iPhone connection when the
 * app immediately follows the write with confirmation traffic.
 */
export async function sendWithoutConfirmation(
  deviceId: string | null,
  frames: Uint8Array[],
  onLog?: (line: string) => void,
): Promise<void> {
  const link = deviceId ? links.get(deviceId) : undefined;
  if (!link || link.simulated) {
    throw new Error("Diffuser is not connected. Reconnect over Bluetooth and try again.");
  }
  if (link.isLive && !(await link.isLive())) {
    if (deviceId) links.delete(deviceId);
    throw new Error("Bluetooth link lost. Reconnect the diffuser and try again.");
  }

  await withIsolatedProtocol(async () => {
    for (const frame of frames) {
      const hex = toHex(frame);
      console.info("[ScentLife] TX", hex);
      onLog?.(`TX ${hex}`);
      await link.write(frame);
      onLog?.(`Write complete`);
    }
    // Let the diffuser finish applying and beeping before the app reports back.
    await wait(1200);
    if (link.isLive && !(await link.isLive())) {
      if (deviceId) links.delete(deviceId);
      throw new Error("Bluetooth disconnected while sending the routine. Pair the diffuser and try again.");
    }
  });
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
  const link = deviceId ? links.get(deviceId) : undefined;
  if (!link || link.simulated) {
    throw new Error("Diffuser is not connected. Reconnect over Bluetooth and try again.");
  }
  if (link.isLive && !(await link.isLive())) {
    if (deviceId) links.delete(deviceId);
    throw new Error("Bluetooth link lost. Reconnect the diffuser and try again.");
  }

  // One frame per command — the module beeps once per accepted command, so the
  // schedule is pushed as a single timer-list frame (0x13), never expanded.
  return withIsolatedProtocol(async () => {
    const acks: FrameAck[] = [];
    for (const frame of frames) {
      const hex = toHex(frame);
      console.info("[ScentLife] TX", hex);
      onLog?.(`TX ${hex}`);
      const fn = frame[3] ?? 0;
      let response: Uint8Array | null = null;
      try {
        response = await link.request(frame, (fn + 0x80) & 0xff);
        onLog?.(`RX ${toHex(response)}`);
      } catch {
        // Some modules acknowledge silently (no notify characteristic).
        response = null;
        onLog?.(`RX none for 0x${fn.toString(16)}`);
      }
      const code = response && response.length >= 6 ? (response[4] ?? null) : null;
      acks.push({ fn, acked: !!response, code, hex });
      if (response && response.length === 7 && response[4] !== 0) {
        throw new Error(`The diffuser rejected command 0x${fn.toString(16)} (error ${response[4]}).`);
      }
      await wait(200);
    }

    if (link.isLive && !(await link.isLive())) {
      if (deviceId) links.delete(deviceId);
      throw new Error("Bluetooth link lost while sending. Reconnect the diffuser and try again.");
    }
    return acks;
  });
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
    if (deviceId) links.delete(deviceId);
    throw new Error("Bluetooth link lost. Reconnect the diffuser and try again.");
  }

  return withIsolatedProtocol(async () => {
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
      if (deviceId) links.delete(deviceId);
      throw new Error("Bluetooth link lost while sending. Reconnect the diffuser and try again.");
    }
    return acks;
  });
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
  try {
    return await withIsolatedProtocol(async () => {
      const frame = buildGetTimers();
      onLog?.(`TX ${toHex(frame)}`);
      const response = await link.request(frame, 0x88);
      onLog?.(`RX ${toHex(response)}`);
      return parseTimerListResponse(response);
    });
  } catch (error) {
    onLog?.(`Read-back failed: ${(error as Error).message}`);
    return null;
  }
}



/**
 * Async connection check — on native builds the OS keeps the GATT link, so we
 * ask the platform instead of relying on the in-memory map.
 */
export async function checkConnection(deviceId: string | null) {
  if (!deviceId) return false;
  if (await isNativePlatform()) {
    return await isNativeConnected(deviceId).catch(() => false);
  }
  const link = links.get(deviceId);
  if (!link || link.simulated) return false;
  // Ask the transport whether the physical GATT link is still up: a device that
  // went out of range or was taken over by another phone must not read as
  // connected just because we once paired with it.
  if (link.isLive && !(await link.isLive().catch(() => false))) {
    links.delete(deviceId);
    return false;
  }
  return true;
}

/**
 * Drops the in-memory GATT link for a device, marking it disconnected.
 * Native builds disconnect at the OS level; web clears the cached link.
 */
export async function disconnect(deviceId: string | null) {
  if (!deviceId) return;
  await links.get(deviceId)?.close?.().catch(() => {});
  if (await isNativePlatform()) {
    const { disconnectNative } = await import("@/lib/native-ble");
    await disconnectNative(deviceId).catch(() => {});
  }
  links.delete(deviceId);
}
