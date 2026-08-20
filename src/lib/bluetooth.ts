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
  parseBatteryReport,
  parseTimerListResponse,
  toHex,
  type BatteryStatus,
  type TimerSlot,
} from "@/lib/scentlife";
import {
  connectNative,
  isNativeConnected,
  isNativePlatform,
  scanForDiffuser,
  writeNative,
} from "@/lib/native-ble";

export type PairedDevice = { deviceId: string; suggestedName: string };

/** Common transparent-serial services used by ScentLife modules. */
const SERVICE_UUIDS = [
  0xffe0,
  0xfff0,
  0xfee7,
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART
];

const CHUNK_SIZE = 20;
const CHUNK_DELAY_MS = 30;

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

const links = new Map<string, Link>();

/** Last battery reading pushed by each device (the protocol has no read command). */
const batteries = new Map<string, BatteryStatus>();
const batteryListeners = new Set<() => void>();

function captureBattery(deviceId: string, frame: Uint8Array) {
  const status = parseBatteryReport(frame);
  if (!status) return;
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
  return () => batteryListeners.delete(listener);
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
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
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
  const server = await device.gatt?.connect();
  if (!server) return false;
  const services = await server.getPrimaryServices();
  const responses = createResponseChannel((frame) => captureBattery(device.id, frame));

  let writable: Char | undefined;
  let writableWithNotify: Char | undefined;
  for (const service of services) {
    const characteristics = await service.getCharacteristics();

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
  if (!writable) return false;


  const write = async (frame: Uint8Array) => {
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
  };
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

export async function pairDiffuser(opts?: {
  preferBrume?: boolean;
  /** Known hardware label ("Device name - Room name") to auto-select when re-connecting. */
  preferName?: string;
}): Promise<PairedDevice> {
  const preferBrume = opts?.preferBrume ?? false;
  const preferName = opts?.preferName?.trim();

  // Native iOS / Android build: scan silently and auto-select the known unit.
  if (await isNativePlatform()) {
    const found = await scanForDiffuser(preferName);
    if (!found) {
      throw new Error("No diffuser found. Double-tap the button and try again.");
    }
    const responses = createResponseChannel((frame) => captureBattery(found.deviceId, frame));
    const target = await connectNative(found.deviceId, (value) => responses.receive(value));
    if (target) {
      const write = async (frame: Uint8Array) => {
        for (let offset = 0; offset < frame.length; offset += CHUNK_SIZE) {
          await writeNative(found.deviceId, target, frame.slice(offset, offset + CHUNK_SIZE));
          await wait(CHUNK_DELAY_MS);
        }
      };
      links.set(found.deviceId, {
        simulated: false,
        write,
        request: async (frame, responseFn) => {
          const response = responses.waitFor(responseFn);
          await write(frame);
          return response;
        },
        waitFor: (fn) => responses.waitFor(fn, 2500),
        isLive: () => isNativeConnected(found.deviceId),
      });
    }
    return { deviceId: found.deviceId, suggestedName: found.name || "The 24/7 Room Diffuser" };
  }

  if (isBluetoothSupported()) {
    const nav = navigator as unknown as { bluetooth: BluetoothLike };
    try {
      // Re-connecting to a known diffuser: narrow the chooser to its hardware label.
      // Otherwise show every nearby device.
      let device: Awaited<ReturnType<BluetoothLike["requestDevice"]>> | null = null;
      if (preferName) {
        device = await nav.bluetooth
          .requestDevice({
            filters: [{ namePrefix: preferName.slice(0, 20) }],
            optionalServices: SERVICE_UUIDS,
          })
          .catch(() => null);
      }
      if (!device) {
        device = await nav.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: SERVICE_UUIDS,
        });
      }

      try {
        await attachLink(device);
      } catch {
        // GATT unavailable — commands fall back to the simulated link.
      }

      const suggested = device.name || (preferBrume ? "BRUME Room Diffuser" : "The 24/7 Room Diffuser");
      return { deviceId: device.id, suggestedName: suggested };
    } catch (error) {
      if ((error as Error)?.name === "NotFoundError") {
        throw new Error("No device selected. Double-tap the button and try again.");
      }
      // Fall through to simulated pairing on unsupported/blocked environments.
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
    suggestedName: preferBrume ? "BRUME Room Diffuser" : "The 24/7 Room Diffuser",
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
    links.delete(deviceId!);
    throw new Error("Bluetooth link lost. Reconnect the diffuser and try again.");
  }

  // One frame per command — the module beeps once per accepted command, so the
  // schedule is pushed as a single timer-list frame (0x13), never expanded.
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
    links.delete(deviceId!);
    throw new Error("Bluetooth link lost while sending. Reconnect the diffuser and try again.");
  }
  return acks;
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
    links.delete(deviceId!);
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
    links.delete(deviceId!);
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
  try {
    const frame = buildGetTimers();
    onLog?.(`TX ${toHex(frame)}`);
    const response = await link.request(frame, 0x88);
    onLog?.(`RX ${toHex(response)}`);
    return parseTimerListResponse(response);
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
