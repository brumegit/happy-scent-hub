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
      const [bluetoothOn, locationOn] = await Promise.all([
        isBluetoothOn(),
        isLocationServiceEnabled(),
      ]);
      setRequirements({
        checking: false,
        bluetoothOff: !bluetoothOn,
        permissionDenied: !granted || isBluetoothPermissionDenied(),
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