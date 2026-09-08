import { useCallback, useEffect, useState } from "react";

import { isBluetoothOn } from "@/lib/bluetooth";
import {
  ensureBluetoothPermission,
  isBluetoothPermissionDenied,
  isLocationServiceEnabled,
} from "@/lib/native-ble";

export type BluetoothRequirements = {
  checking: boolean;
  bluetoothOff: boolean;
  permissionDenied: boolean;
  locationOff: boolean;
};

const INITIAL_REQUIREMENTS: BluetoothRequirements = {
  checking: true,
  bluetoothOff: false,
  permissionDenied: false,
  locationOff: false,
};

/**
 * Requests Android's scan permissions, then reports each remaining blocker.
 * Keeping `checking` true initially prevents pairing controls from flashing
 * before the native permission result reaches the remote web app.
 */
export function useBluetoothRequirements(active = true) {
  const [requirements, setRequirements] = useState<BluetoothRequirements>(INITIAL_REQUIREMENTS);

  // Returns the fresh result too, so callers can gate an action on it without
  // waiting for React state to settle.
  const refresh = useCallback(async (): Promise<BluetoothRequirements> => {
    setRequirements((current) => ({ ...current, checking: true }));
    let next: BluetoothRequirements;
    try {
      const granted = await ensureBluetoothPermission();
      const denied = !granted || isBluetoothPermissionDenied();
      if (denied) {
        // Without the permission, the radio and location probes are unreliable,
        // so report only the blocker we are sure about.
        next = {
          checking: false,
          bluetoothOff: false,
          permissionDenied: true,
          locationOff: false,
        };
      } else {
        const [bluetoothOn, locationOn] = await Promise.all([
          isBluetoothOn(),
          isLocationServiceEnabled(),
        ]);
        next = {
          checking: false,
          bluetoothOff: !bluetoothOn,
          permissionDenied: false,
          locationOff: !locationOn,
        };
      }
    } catch {
      next = {
        checking: false,
        bluetoothOff: false,
        permissionDenied: true,
        locationOff: false,
      };
    }
    setRequirements(next);
    return next;
  }, []);

  useEffect(() => {
    if (!active) return;
    void refresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [active, refresh]);

  return { ...requirements, refresh };
}
/**
 * Single source of truth for what the user must fix, so Home and Setup never
 * confuse "Bluetooth is off" with "Brume is not allowed to use Bluetooth".
 */
export function bluetoothRequirementPrompt(req: {
  bluetoothOff: boolean;
  permissionDenied: boolean;
  locationOff: boolean;
}) {
  const { bluetoothOff, permissionDenied, locationOff } = req;
  // Case 2: the app has not been granted Bluetooth/Location permission.
  // This is distinct from the radio being off — send the user to the app's
  // permission settings so they can allow Brume to use Bluetooth.
  if (permissionDenied) {
    return {
      message: locationOff
        ? "Brume is not allowed to use Bluetooth on this phone, and Location is off. Allow Nearby devices and Location for Brume, then turn Location on."
        : "Brume is not allowed to use Bluetooth on this phone. Allow access so the app can find your diffuser.",
      // Ask the OS again first — that shows the native "Allow" popup. Only if
      // the system refuses again does the caller fall back to app settings.
      cta: "Allow Bluetooth" as const,
      target: "permission" as const,
    };
  }
  // Case 1: the phone's Bluetooth radio is switched off, but Brume already
  // has permission. The fix is on the phone itself, so just tell the user to
  // turn Bluetooth on — no settings page to open.
  if (bluetoothOff) {
    return {
      message: locationOff
        ? "Turn Bluetooth and Location on to pair your diffuser."
        : "Turn Bluetooth ON on your iPhone or Android to pair your diffuser.",
      cta: locationOff ? ("Open location settings" as const) : ("" as const),
      target: locationOff ? ("location" as const) : ("app" as const),
    };
  }
  return {
    message: "Bluetooth is on, but Location is off. Android needs Location switched on to find Bluetooth devices.",
    cta: "Open location settings" as const,
    target: "location" as const,
  };
}
