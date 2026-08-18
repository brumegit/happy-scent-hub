/**
 * Thin wrapper around Web Bluetooth. Browsers without support (Safari, Firefox)
 * fall back to a simulated pairing so onboarding is never a dead end.
 */
export type PairedDevice = { deviceId: string; suggestedName: string };

export function isBluetoothSupported() {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export async function pairDiffuser(): Promise<PairedDevice> {
  if (isBluetoothSupported()) {
    try {
      const nav = navigator as Navigator & {
        bluetooth: {
          requestDevice: (opts: unknown) => Promise<{ id: string; name?: string }>;
        };
      };
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ["battery_service"],
      });
      return {
        deviceId: device.id,
        suggestedName: device.name || "My Diffuser",
      };
    } catch (error) {
      if ((error as Error)?.name === "NotFoundError") {
        throw new Error("No device selected. Keep your diffuser awake and try again.");
      }
      // Fall through to simulated pairing on unsupported/blocked environments.
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 1600));
  return {
    deviceId: `sim-${Math.random().toString(36).slice(2, 10)}`,
    suggestedName: "My Diffuser",
  };
}
