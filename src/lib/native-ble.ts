/**
 * Native (iOS / Android) Bluetooth transport via Capacitor.
 *
 * On a native build this scans in the background, auto-selects the first
 * advertising device whose name contains "BRUME" and connects without showing
 * any picker. On the web this module is inert — bluetooth.ts falls back to
 * Web Bluetooth.
 */

export type NativeChar = { service: string; characteristic: string };

export type NativeDevice = {
  deviceId: string;
  name?: string;
};

type BleClientType = typeof import("@capacitor-community/bluetooth-le")["BleClient"];

let bleClient: BleClientType | null = null;

export async function isNativePlatform() {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

async function client() {
  if (bleClient) return bleClient;
  const mod = await import("@capacitor-community/bluetooth-le");
  await mod.BleClient.initialize({ androidNeverForLocation: true });
  bleClient = mod.BleClient;
  return bleClient;
}

/**
 * Scans for up to `timeoutMs` and resolves with the first device whose name
 * contains "BRUME"; otherwise resolves with the strongest nearby device that
 * exposes a name.
 */
export async function scanForDiffuser(timeoutMs = 6000): Promise<NativeDevice | null> {
  const ble = await client();
  const seen: { device: NativeDevice; rssi: number }[] = [];
  let matched: NativeDevice | null = null;

  await ble.requestLEScan({ allowDuplicates: false }, (result) => {
    const name = result.localName || result.device?.name;
    if (!name) return;
    const device = { deviceId: result.device.deviceId, name };
    seen.push({ device, rssi: result.rssi ?? -999 });
    if (!matched && name.toUpperCase().includes("BRUME")) matched = device;
  });

  const started = Date.now();
  while (!matched && Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 250));
  }
  await ble.stopLEScan().catch(() => undefined);

  if (matched) return matched;
  seen.sort((a, b) => b.rssi - a.rssi);
  return seen[0]?.device ?? null;
}

/** Connects and returns the writable characteristic to use for the protocol. */
export async function connectNative(
  deviceId: string,
  onNotify?: (value: Uint8Array) => void,
): Promise<NativeChar | null> {
  const ble = await client();
  await ble.connect(deviceId);
  const services = await ble.getServices(deviceId);

  let writable: NativeChar | null = null;
  for (const service of services) {
    for (const ch of service.characteristics) {
      if (ch.properties.notify && onNotify) {
        try {
          await ble.startNotifications(deviceId, service.uuid, ch.uuid, (v) =>
            onNotify(new Uint8Array(v.buffer)),
          );
        } catch {
          // optional
        }
      }
      if (!writable && (ch.properties.writeWithoutResponse || ch.properties.write)) {
        writable = { service: service.uuid, characteristic: ch.uuid };
      }
    }
  }
  return writable;
}

export async function writeNative(deviceId: string, target: NativeChar, chunk: Uint8Array) {
  const ble = await client();
  const view = new DataView(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));
  try {
    await ble.writeWithoutResponse(deviceId, target.service, target.characteristic, view);
  } catch {
    await ble.write(deviceId, target.service, target.characteristic, view);
  }
}

export async function isNativeConnected(deviceId: string) {
  try {
    const ble = await client();
    const devices = await ble.getConnectedDevices([]);
    return devices.some((d) => d.deviceId === deviceId);
  } catch {
    return false;
  }
}

/** Disconnects the GATT link on a native build. */
export async function disconnectNative(deviceId: string) {
  const ble = await client();
  await ble.disconnect(deviceId);
}
