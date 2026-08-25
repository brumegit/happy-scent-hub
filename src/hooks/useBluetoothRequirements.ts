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

  const refresh = useCallback(async () => {
    if (!active) return;
    setRequirements((current) => ({ ...current, checking: true }));
    try {
      const granted = await ensureBluetoothPermission();
      const denied = !granted || isBluetoothPermissionDenied();
      if (denied) {
        // Without the permission, the radio and location probes are unreliable,
        // so report only the blocker we are sure about.
        setRequirements({
          checking: false,
          bluetoothOff: false,
          permissionDenied: true,
          locationOff: false,
        });
        return;
      }
      const [bluetoothOn, locationOn] = await Promise.all([
        isBluetoothOn(),
        isLocationServiceEnabled(),
      ]);
      setRequirements({
        checking: false,
        bluetoothOff: !bluetoothOn,
        permissionDenied: false,
        locationOff: !locationOn,
      });
    } catch {
      setRequirements({
        checking: false,
        bluetoothOff: false,
        permissionDenied: true,
        locationOff: false,
      });
    }
  }, [active]);

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
  if (permissionDenied) {
    return {
      message: locationOff
        ? "Brume is not allowed to use Bluetooth on this phone, and Location is off. Allow Nearby devices and Location for Brume, then turn Location on."
        : "Brume is not allowed to use Bluetooth on this phone. Allow Nearby devices and Location for Brume in the app settings.",
      cta: "Open app settings" as const,
      target: "app" as const,
    };
  }
  if (bluetoothOff) {
    return {
      message: locationOff
        ? "Bluetooth and Location are off. Turn both on to pair your diffuser."
        : "Bluetooth is off, turn it on to pair your diffuser.",
      cta: locationOff ? ("Open location settings" as const) : ("Open app settings" as const),
      target: locationOff ? ("location" as const) : ("app" as const),
    };
  }
  return {
    message: "Bluetooth is on, but Location is off. Android needs Location switched on to find Bluetooth devices.",
    cta: "Open location settings" as const,
    target: "location" as const,
  };
}
