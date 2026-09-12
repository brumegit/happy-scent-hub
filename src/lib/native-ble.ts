/**
 * Native (iOS / Android) Bluetooth transport via Capacitor.
 *
 * On a native build this uses the operating system's Bluetooth device chooser.
 * On the web this module is inert — bluetooth.ts falls back to Web Bluetooth.
 */

import { trace } from "@/lib/ble-log";

export type NativeChar = { service: string; characteristic: string };

export type NativeDevice = {
  deviceId: string;
  name?: string;
};

type BleClientType = typeof import("@capacitor-community/bluetooth-le")["BleClient"];

let bleClient: BleClientType | null = null;

/**
 * Devices we hold an open GATT link to. iOS cannot answer
 * `getConnectedDevices([])` (CoreBluetooth requires service UUIDs), so the
 * plugin's disconnect callback is the reliable source of truth on both
 * platforms.
 */
const connectedIds = new Set<string>();

const connectedTargets = new Map<string, NativeChar>();
const connectedNotify = new Map<string, (value: Uint8Array) => void>();
const connectionGenerations = new Map<string, number>();

const disconnectListeners = new Set<(deviceId: string) => void>();

function markDisconnected(deviceId: string) {
  trace(`native disconnect event for ${deviceId}`);
  connectedIds.delete(deviceId);
  connectedTargets.delete(deviceId);
  connectedNotify.delete(deviceId);
  disconnectListeners.forEach((listener) => listener(deviceId));
}

/** Delivers the operating system's disconnect event without waiting for polling. */
export function subscribeNativeDisconnect(listener: (deviceId: string) => void) {
  disconnectListeners.add(listener);
  return () => {
    disconnectListeners.delete(listener);
  };
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isTransientGattError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("gatt") ||
    message.includes("status 8") ||
    message.includes("status 62") ||
    message.includes("status 113") ||
    message.includes("status 133") ||
    message.includes("connection timeout")
  );
}

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
    // Android links BLE discovery to location. Requesting the location
    // permission alongside Nearby devices is what makes the scan actually
    // return results on real phones, so keep this aligned with the manifest.
    await mod.BleClient.initialize({ androidNeverForLocation: false });
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

/**
 * Asks the operating system for the Bluetooth (and, on Android, Location)
 * permissions without starting a scan. Safe to call on mount so the pairing
 * screen can hide the pairing option until access is granted.
 */
export async function ensureBluetoothPermission(): Promise<boolean> {
  if (!isNativeSync()) return true;
  try {
    const mod = await import("@capacitor-community/bluetooth-le");
    await mod.BleClient.initialize({ androidNeverForLocation: false });
    permissionDenied = false;
    void requestNotificationPermission();
    return true;
  } catch {
    permissionDenied = true;
    return false;
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

/**
 * Android only: reports whether the phone's Location service is switched on.
 * Android refuses to return BLE scan results while it is off, which shows up
 * as an empty device list rather than an error, so we detect it up front.
 * Returns true on platforms where the question does not apply.
 */
export async function isLocationServiceEnabled(): Promise<boolean> {
  if (!isNativeSync()) return true;
  try {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    if (cap?.getPlatform?.() !== "android") return true;
    const mod = await import("@capacitor-community/bluetooth-le");
    return await mod.BleClient.isLocationEnabled();
  } catch {
    return true;
  }
}

/** Android only: opens the system Location settings screen. */
export async function openLocationSettings() {
  try {
    const mod = await import("@capacitor-community/bluetooth-le");
    await mod.BleClient.openLocationSettings();
  } catch {
    // ignore
  }
}

export const PERMISSION_ERROR =
  "Bluetooth permission was refused. Allow \"Nearby devices\" and \"Location\" for Brume in your phone settings, then try again.";

/** A caller-supplied chooser: receives live scan results, resolves with a pick. */
export type DeviceChooser = (
  subscribe: (listener: (devices: NativeDevice[]) => void) => void,
) => Promise<NativeDevice | null>;

/** Nameless peripherals are noise — the user recognises their diffuser by name. */
function isNamed(name: string | undefined): name is string {
  const n = (name ?? "").trim();
  return n.length > 0 && n.toLowerCase() !== "unknown";
}

/**
 * Finds the diffuser. A Brume peripheral is picked up silently; otherwise the
 * app's own list of *named* nearby devices is shown (the system chooser lists
 * every nameless peripheral, which is unusable).
 */
export async function requestNativeDevice(choose?: DeviceChooser): Promise<NativeDevice> {
  const ble = await client();

  const known = await scanForBrume(ble).catch(() => null);
  if (known) return known;

  if (choose) {
    const found = new Map<string, NativeDevice>();
    let notify: ((devices: NativeDevice[]) => void) | null = null;
    const emit = () => notify?.([...found.values()]);
    await ble
      .requestLEScan({ allowDuplicates: false }, (result) => {
        const name = result.localName ?? result.device?.name;
        if (!isNamed(name)) return;
        found.set(result.device.deviceId, { deviceId: result.device.deviceId, name });
        emit();
      })
      .catch(() => undefined);
    try {
      const picked = await choose((listener) => {
        notify = listener;
        emit();
      });
      if (!picked) throw new Error("No device selected.\nDouble-tap the button and try again.");
      return picked;
    } finally {
      notify = null;
      await ble.stopLEScan().catch(() => undefined);
    }
  }

  try {
    return await ble.requestDevice({});
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("cancel") || message.includes("dismiss")) {
      throw new Error("No device selected.\nDouble-tap the button and try again.");
    }
    throw error;
  }
}


/**
 * Short unfiltered scan that resolves as soon as a peripheral whose name
 * contains "BRUME" shows up. Resolves null when none appears in time so the
 * native chooser can take over.
 */
async function scanForBrume(
  ble: Awaited<ReturnType<typeof client>>,
): Promise<NativeDevice | null> {
  return await new Promise<NativeDevice | null>((resolve) => {
    let settled = false;
    const finish = (device: NativeDevice | null) => {
      if (settled) return;
      settled = true;
      void ble.stopLEScan().catch(() => undefined);
      clearTimeout(timer);
      resolve(device);
    };
    const timer = setTimeout(() => finish(null), 5000);
    void ble
      .requestLEScan({ allowDuplicates: false }, (result) => {
        const name = result.localName ?? result.device?.name ?? "";
        if (name.toUpperCase().includes("BRUME")) {
          finish({ deviceId: result.device.deviceId, name });
        }
      })
      .catch(() => finish(null));
  });
}


/** Connects and returns the writable characteristic to use for the protocol. */
export async function connectNative(
  deviceId: string,
  onNotify?: (value: Uint8Array) => void,
): Promise<NativeChar | null> {
  const ble = await client();
  const existingTarget = connectedTargets.get(deviceId);
  if (connectedIds.has(deviceId) && existingTarget) {
    trace("native connection already live — reusing serial channel");
    return existingTarget;
  }
  const generation = (connectionGenerations.get(deviceId) ?? 0) + 1;
  connectionGenerations.set(deviceId, generation);
  // Android can reject a GATT connection when it starts in the same radio
  // timeslice as the chooser's scan teardown. Give scanning time to stop, then
  // retry only transient GATT failures after fully closing the stale client.
  await wait(700);
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await ble.connect(deviceId, () => {
        if (connectionGenerations.get(deviceId) === generation) markDisconnected(deviceId);
      }, {
        timeout: 15_000,
        skipDescriptorDiscovery: true,
      });
      connectedIds.add(deviceId);
      trace(`native connect ok (attempt ${attempt + 1})`);
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      trace(
        `native connect attempt ${attempt + 1} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (!isTransientGattError(error) || attempt === 2) break;
      await wait(900 * (attempt + 1));
    }
  }
  if (lastError) {
    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(
      `Could not connect to the diffuser (${detail}). Make sure it is not connected to nRF Connect, Scent Tech, or another phone, then restart the diffuser and try again.`,
      { cause: lastError },
    );
  }
  const services = await ble.getServices(deviceId);
  trace(`native services discovered: ${services.length}`);

  let writable: NativeChar | null = null;
  for (const service of services) {
    for (const ch of service.characteristics) {
      // Keep the proven iPhone transport behavior: use the first writable
      // characteristic reported by CoreBluetooth. Preferring a later service
      // merely because notifications started there selected the wrong channel
      // on some Brume hardware revisions.
      if (!writable && (ch.properties.writeWithoutResponse || ch.properties.write)) {
        writable = { service: service.uuid, characteristic: ch.uuid };
      }
    }
  }
  if (!writable) {
    throw new Error("The selected Bluetooth device does not expose a compatible diffuser connection.");
  }
  // Listen only on the serial service. Subscribing to every notifying service
  // can feed unrelated reports into the protocol parser and create extra writes
  // while routines are being saved.
  if (onNotify) {
    const serialService = services.find((service) => service.uuid === writable.service);
    for (const ch of serialService?.characteristics ?? []) {
      if (!ch.properties.notify && !ch.properties.indicate) continue;
      try {
        await ble.startNotifications(deviceId, writable.service, ch.uuid, (v) => {
          connectedNotify.get(deviceId)?.(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
        });
        trace(`notifications started on ${writable.service.slice(0, 8)}/${ch.uuid.slice(0, 8)}`);
      } catch (error) {
        trace(
          `notifications failed on ${ch.uuid.slice(0, 8)}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
  connectedTargets.set(deviceId, writable);
  trace(
    `serial channel selected ${writable.service.slice(0, 8)}/${writable.characteristic.slice(0, 8)}`,
  );
  return writable;
}

export async function writeNative(deviceId: string, target: NativeChar, chunk: Uint8Array) {
  const ble = await client();
  const view = new DataView(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));
  const hex = Array.from(chunk)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
  // This diffuser's confirmed iPhone path is write-without-response. Never
  // replay the same bytes with another write mode: the first write may already
  // have reached the firmware, and a duplicate can reset its BLE session.
  await ble.writeWithoutResponse(deviceId, target.service, target.characteristic, view);
  trace(`chunk ${chunk.length}B write-no-response ok · ${hex}`);
}

/**
 * True until CoreBluetooth sends its disconnect callback. This callback is the
 * authoritative iOS signal; polling getConnectedDevices can transiently omit a
 * live peripheral and must never make the app tear down a working session.
 */
export async function isNativeConnected(deviceId: string) {
  if (!connectedIds.has(deviceId)) return false;
  const target = connectedTargets.get(deviceId);
  if (!target) return false;
  try {
    // CoreBluetooth's retrieveConnectedPeripherals call is passive: it asks iOS
    // for its current connection registry and sends no GATT command. This avoids
    // the stale in-memory "connected" state seen after firmware restarts.
    const ble = await client();
    const devices = await ble.getConnectedDevices([target.service]);
    const connected = devices.some((device) => device.deviceId === deviceId);
    if (!connected) markDisconnected(deviceId);
    return connected;
  } catch (error) {
    trace(
      `passive native connection check failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return connectedIds.has(deviceId);
  }
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
    // Android throws here when the app lacks the Bluetooth permission, which is
    // NOT the same as the radio being off. Report "on" so the UI blames the
    // missing permission instead of wrongly telling the user Bluetooth is off.
    return true;
  }
}
