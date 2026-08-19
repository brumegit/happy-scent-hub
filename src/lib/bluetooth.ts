/**
 * Web Bluetooth transport for the ScentLife serial protocol.
 *
 * The diffuser exposes the protocol over a transparent serial GATT service.
 * Frames are written in 20-byte chunks (default BLE MTU) — larger single writes
 * are silently dropped by these serial modules, which is why the device never
 * beeps when a whole timer-list frame is written at once.
 */
import { toHex } from "@/lib/scentlife";

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
  simulated: boolean;
};

const links = new Map<string, Link>();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  gatt?: { connect: () => Promise<{ getPrimaryServices: () => Promise<{ getCharacteristics: () => Promise<Char[]> }[]> }> };
}) {
  const server = await device.gatt?.connect();
  if (!server) return false;
  const services = await server.getPrimaryServices();

  let writable: Char | undefined;
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
            console.info("[ScentLife] RX", toHex(new Uint8Array(value.buffer)));
          }
        });
      } catch {
        // Notifications are optional.
      }
    }

    writable =
      writable ??
      characteristics.find((c) => c.properties?.writeWithoutResponse || c.properties?.write);
  }

  if (!writable) return false;

  links.set(device.id, {
    simulated: false,
    write: async (frame) => {
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
    },
  });
  return true;
}

export async function pairDiffuser(opts?: { preferBrume?: boolean }): Promise<PairedDevice> {
  const preferBrume = opts?.preferBrume ?? false;
  if (isBluetoothSupported()) {
    const nav = navigator as unknown as { bluetooth: BluetoothLike };
    try {
      // Always show every nearby device; the chooser highlights a BRUME unit
      // when one is advertising so it can be picked in one tap.
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: SERVICE_UUIDS,
      });

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
  });
  return {
    deviceId,
    suggestedName: preferBrume ? "BRUME Room Diffuser" : "The 24/7 Room Diffuser",
  };
}

/**
 * Sends protocol frames to the diffuser, one at a time with a gap so the module
 * has time to parse and acknowledge each frame (the device beeps per accepted
 * command).
 */
export async function sendFrames(deviceId: string | null, frames: Uint8Array[]) {
  const link = deviceId ? links.get(deviceId) : undefined;
  for (const frame of frames) {
    console.info("[ScentLife] TX", toHex(frame));
    if (link) {
      await link.write(frame);
    } else {
      await wait(200);
    }
    // Inter-frame gap: the module needs to process before the next command.
    await wait(150);
  }
}
