/**
 * Native (iOS / Android) Bluetooth transport via Capacitor.
 *
 * On a native build this uses the operating system's Bluetooth device chooser.
 * On the web this module is inert — bluetooth.ts falls back to Web Bluetooth.
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

/**
 * Set as soon as the operating system refuses the Bluetooth permission, so the
 * UI can tell "Bluetooth is off" apart from "the app is not allowed to use
 * Bluetooth" and send the user to the right place.
 */
let permissionDenied = false;

export function isBluetoothPermissionDenied() {
  return permissionDenied;
}

async function client() {
  if (bleClient) return bleClient;
  const mod = await import("@capacitor-community/bluetooth-le");
  try {
    // Bluetooth only: `neverForLocation` tells Android the scan is never used
    // to derive the user's position, so no location permission is requested.
    await mod.BleClient.initialize({ androidNeverForLocation: true });
    permissionDenied = false;
  } catch (error) {
    permissionDenied = true;
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
  void requestNotificationPermission();
  return bleClient;
}

/**
 * Asked for only after Bluetooth has been granted, so the two system prompts
 * never overlap. Failure is silent: notifications are optional.
 */
let notificationsAsked = false;
export async function requestNotificationPermission() {
  if (notificationsAsked) return;
  notificationsAsked = true;
  try {
    if (isNativeSync()) {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const current = await LocalNotifications.checkPermissions();
      if (current.display === "prompt" || current.display === "prompt-with-rationale") {
        await LocalNotifications.requestPermissions();
      }
      return;
    }
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  } catch {
    // optional
  }
}

/** Opens this app's system settings page (permissions live there). */
export async function openAppSettings() {
  try {
    const mod = await import("@capacitor-community/bluetooth-le");
    await mod.BleClient.openAppSettings();
  } catch {
    // ignore
  }
}

export const PERMISSION_ERROR =
  "Bluetooth permission was refused. Allow \"Nearby devices\" for Brume in your phone settings, then try again.";

/**
 * Opens the native Android/iOS BLE chooser and returns the device selected by
 * the user. The plugin owns scanning, permission handling and dialog lifecycle,
 * avoiding a second scanner implemented inside the web view.
 */
export async function requestNativeDevice(): Promise<NativeDevice> {
  const ble = await client();
  try {
    // Intentionally pass no filters: the native list must show every nearby
    // BLE peripheral and wait for the user to choose one.
    return await ble.requestDevice({});
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("cancel") || message.includes("dismiss")) {
      throw new Error("No device selected.\nDouble-tap the button and try again.");
    }
    throw error;
  }
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
