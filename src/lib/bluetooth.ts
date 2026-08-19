/**
 * Web Bluetooth transport for the ScentLife serial protocol.
 *
 * The diffuser exposes the protocol over a transparent serial GATT service.
 * Browsers without Web Bluetooth (Safari, Firefox) fall back to a simulated
 * link so onboarding is never a dead end.
 */
import { toHex } from "@/lib/scentlife";

export type PairedDevice = { deviceId: string; suggestedName: string };

/** Common transparent-serial services used by ScentLife modules. */
const SERVICE_UUIDS = [
  0xffe0,
  0xfff0,
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART
];

type Writer = (frame: Uint8Array) => Promise<void>;

const writers = new Map<string, Writer>();

export function isBluetoothSupported() {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

type BluetoothLike = {
  requestDevice: (opts: unknown) => Promise<{
    id: string;
    name?: string;
    gatt?: {
      connect: () => Promise<{
        getPrimaryServices: () => Promise<
          { getCharacteristics: () => Promise<Record<string, unknown>[]> }[]
        >;
      }>;
    };
  }>;
};

export async function pairDiffuser(): Promise<PairedDevice> {
  if (isBluetoothSupported()) {
    const nav = navigator as unknown as { bluetooth: BluetoothLike };
    try {
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: SERVICE_UUIDS,
      });

      // Best-effort GATT connect: grab the first writable characteristic.
      try {
        const server = await device.gatt?.connect();
        const services = (await server?.getPrimaryServices()) ?? [];
        for (const service of services) {
          const characteristics = await service.getCharacteristics();
          const writable = characteristics.find(
            (c) =>
              (c as { properties?: { write?: boolean; writeWithoutResponse?: boolean } })
                .properties?.write ||
              (c as { properties?: { writeWithoutResponse?: boolean } }).properties
                ?.writeWithoutResponse,
          ) as
            | { writeValueWithoutResponse?: (v: Uint8Array) => Promise<void>; writeValue?: (v: Uint8Array) => Promise<void> }
            | undefined;
          if (writable) {
            writers.set(device.id, async (frame) => {
              if (writable.writeValueWithoutResponse) await writable.writeValueWithoutResponse(frame);
              else await writable.writeValue?.(frame);
            });
            break;
          }
        }
      } catch {
        // GATT unavailable — commands fall back to the simulated link.
      }

      return { deviceId: device.id, suggestedName: device.name || "The 24/7 Room Diffuser" };
    } catch (error) {
      if ((error as Error)?.name === "NotFoundError") {
        throw new Error("No device selected. Double-tap the button and try again.");
      }
      // Fall through to simulated pairing on unsupported/blocked environments.
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 2200));
  return {
    deviceId: `sim-${Math.random().toString(36).slice(2, 10)}`,
    suggestedName: "The 24/7 Room Diffuser",
  };
}

/** Sends protocol frames to the diffuser. Resolves once acknowledged (or simulated). */
export async function sendFrames(deviceId: string | null, frames: Uint8Array[]) {
  const writer = deviceId ? writers.get(deviceId) : undefined;
  for (const frame of frames) {
    if (writer) {
      await writer(frame);
    } else {
      // Simulated link — surfaced in the console so hardware frames stay verifiable.
      console.info("[ScentLife] TX", toHex(frame));
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}
