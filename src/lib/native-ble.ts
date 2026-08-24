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

/**
 * Synchronous native check. The Capacitor bridge injects `window.Capacitor`
 * into the webview (including when the shell loads a remote URL), so the UI can
 * branch on it during render without awaiting a dynamic import.
 */
export function isNativeSync() {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; platform?: string } })
    .Capacitor;
  if (!cap) return false;
  if (typeof cap.isNativePlatform === "function") return cap.isNativePlatform();
  return cap.platform === "ios" || cap.platform === "android";
}

export async function isNativePlatform() {
  if (isNativeSync()) return true;
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
  try {
    // Asks for the runtime Bluetooth permissions on Android 12+ and for the
    // CoreBluetooth authorisation on iOS. Throws when the user denies them.
    await mod.BleClient.initialize({ androidNeverForLocation: true });
  } catch (error) {
    throw new Error(PERMISSION_ERROR, { cause: error });
  }
  try {
    const enabled = await mod.BleClient.isEnabled();
    if (!enabled) {
      // Android can prompt the user to switch Bluetooth on; iOS cannot.
      await mod.BleClient.requestEnable().catch(() => undefined);
      const nowEnabled = await mod.BleClient.isEnabled().catch(() => false);
      if (!nowEnabled) throw new Error("Bluetooth is off. Turn it on and try again.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Bluetooth is off")) throw error;
    // isEnabled/requestEnable are unavailable on some platforms — keep going.
  }
  bleClient = mod.BleClient;
  return bleClient;
}

/** Marker used by the UI to show the "allow Bluetooth" dialog. */
export const PERMISSION_ERROR =
  "Bluetooth permission was refused. Allow \"Nearby devices\" for Brume in your phone settings, then try again.";

export function isPermissionError(error: unknown) {
  return error instanceof Error && error.message === PERMISSION_ERROR;
}

/**
 * Triggers the OS permission prompt (first run) and reports whether Bluetooth
 * access is usable. Never throws.
 */
export async function ensureNativePermissions(): Promise<boolean> {
  if (!isNativeSync()) return true;
  try {
    const mod = await import("@capacitor-community/bluetooth-le");
    await mod.BleClient.initialize({ androidNeverForLocation: true });
    return true;
  } catch {
    return false;
  }
}

/** Opens the OS settings page for this app so the user can grant permissions. */
export async function openNativeAppSettings() {
  try {
    const mod = await import("@capacitor-community/bluetooth-le");
    await mod.BleClient.openAppSettings();
    return true;
  } catch {
    return false;
  }
}

export type ScannedDevice = NativeDevice & { rssi: number };

/**
 * Live scan that streams every named device it sees, strongest first, so the
 * user can pick manually. Returns a stop function.
 */
export async function startDeviceScan(
  onUpdate: (devices: ScannedDevice[]) => void,
): Promise<() => Promise<void>> {
  const ble = await client();
  const found = new Map<string, ScannedDevice>();

  await ble.requestLEScan({ allowDuplicates: true }, (result) => {
    const name = result.localName || result.device?.name;
    if (!name) return;
    found.set(result.device.deviceId, {
      deviceId: result.device.deviceId,
      name,
      rssi: result.rssi ?? -999,
    });
    onUpdate([...found.values()].sort((a, b) => b.rssi - a.rssi));
  });

  return async () => {
    await ble.stopLEScan().catch(() => undefined);
  };
}


/**
 * Scans for up to `timeoutMs` and resolves with the first device whose name
 * contains "BRUME"; otherwise resolves with the strongest nearby device that
 * exposes a name.
 */
export async function scanForDiffuser(
  preferName?: string,
  timeoutMs = 6000,
): Promise<NativeDevice | null> {
  const ble = await client();
  const seen: { device: NativeDevice; rssi: number }[] = [];
  let matched: NativeDevice | null = null;
  const wanted = preferName?.trim().toUpperCase();

  await ble.requestLEScan({ allowDuplicates: false }, (result) => {
    const name = result.localName || result.device?.name;
    if (!name) return;
    const device = { deviceId: result.device.deviceId, name };
    seen.push({ device, rssi: result.rssi ?? -999 });
    const upper = name.toUpperCase();
    if (matched) return;
    // When re-connecting to a known diffuser, match its "Device name - Room name"
    // hardware label first; otherwise fall back to any BRUME unit.
    if (wanted ? upper.includes(wanted) : upper.includes("BRUME")) matched = device;
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

/**
 * Reports whether Bluetooth is currently switched on. On native builds this
 * queries the adapter directly (Android) or the CoreBluetooth state (iOS);
 * on the web it falls back to the Web Bluetooth availability promise. It
 * never requests permissions or scans, so it is safe to call on mount to show
 * a "Bluetooth is off" hint before the user tries to pair.
 */
export async function isBluetoothEnabled(): Promise<boolean> {
  if (!isNativeSync()) {
    if (typeof navigator !== "undefined" && "bluetooth" in navigator) {
      try {
        const nav = navigator as unknown as {
          bluetooth?: { getAvailability?: () => Promise<boolean> };
        };
        if (nav.bluetooth?.getAvailability) return await nav.bluetooth.getAvailability();
      } catch {
        // ignore
      }
    }
    return true;
  }
  try {
    const mod = await import("@capacitor-community/bluetooth-le");
    return await mod.BleClient.isEnabled();
  } catch {
    return false;
  }
}
