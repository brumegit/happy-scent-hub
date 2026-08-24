import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Settings, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { connectPickedDevice, type PairedDevice } from "@/lib/bluetooth";
import {
  ensureNativePermissions,
  openNativeAppSettings,
  startDeviceScan,
  type ScannedDevice,
} from "@/lib/native-ble";

/** Delay before auto-connecting a recognised BRUME unit, so the list is visible. */
const AUTO_CONNECT_DELAY_MS = 1800;

function signalBars(rssi: number) {
  if (rssi >= -60) return 4;
  if (rssi >= -70) return 3;
  if (rssi >= -80) return 2;
  return 1;
}

function Signal({ rssi }: { rssi: number }) {
  const bars = signalBars(rssi);
  return (
    <span className="flex items-end gap-0.5" aria-label={`Signal ${bars} of 4`}>
      {[1, 2, 3, 4].map((level) => (
        <span
          key={level}
          className={`w-1 ${level <= bars ? "bg-foreground" : "bg-border"}`}
          style={{ height: `${level * 3 + 3}px` }}
        />
      ))}
    </span>
  );
}

/**
 * Native device chooser. Lists every nearby Bluetooth device with its signal
 * strength so the user can pick manually, and auto-connects when a unit
 * advertising the BRUME name (or the known hardware label) is detected.
 */
export function DevicePicker({
  open,
  preferName,
  onCancel,
  onConnected,
  onError,
}: {
  open: boolean;
  preferName?: string;
  onCancel: () => void;
  onConnected: (device: PairedDevice) => void;
  onError: (message: string) => void;
}) {
  const [devices, setDevices] = useState<ScannedDevice[]>([]);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [slowScan, setSlowScan] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const stopRef = useRef<(() => Promise<void>) | null>(null);
  const connectedRef = useRef(false);

  // Kept in refs so a parent re-render never restarts the scan.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  const connect = useCallback(
    async (device: ScannedDevice) => {
      if (connectedRef.current) return;
      connectedRef.current = true;
      setConnectingId(device.deviceId);
      await stopRef.current?.();
      try {
        const paired = await connectPickedDevice(device);
        onConnectedRef.current(paired);
      } catch (err) {
        connectedRef.current = false;
        setConnectingId(null);
        onErrorRef.current((err as Error).message || "Could not connect to that device.");
      }
    },
    [],
  );

  // Ask for permissions, then stream nearby devices while the sheet is open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    connectedRef.current = false;
    setDevices([]);
    setConnectingId(null);
    setScanError(null);
    setSlowScan(false);
    const slowTimer = setTimeout(() => !cancelled && setSlowScan(true), 12000);

    void (async () => {
      const granted = await ensureNativePermissions();
      if (cancelled) return;
      if (!granted) {
        setPermissionDenied(true);
        return;
      }
      setPermissionDenied(false);
      try {
        const stop = await startDeviceScan((list) => {
          if (!cancelled) setDevices(list);
        });
        if (cancelled) {
          await stop();
          return;
        }
        stopRef.current = stop;
      } catch (err) {
        if (!cancelled) setScanError((err as Error).message || "Bluetooth scan failed.");
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
      void stopRef.current?.();
      stopRef.current = null;
    };

  }, [open]);

  // Auto-connect the diffuser once it shows up, after a short delay so the user
  // still sees the list appear.
  useEffect(() => {
    if (!open || permissionDenied || connectedRef.current) return;
    const wanted = preferName?.trim().toUpperCase();
    const match = devices.find((d) => {
      const upper = (d.name ?? "").toUpperCase();
      return wanted ? upper.includes(wanted) : upper.includes("BRUME");
    });
    if (!match) return;
    const timer = setTimeout(() => void connect(match), AUTO_CONNECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [devices, open, permissionDenied, preferName, connect]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-6 py-5">
        <h2 className="font-display text-2xl">
          {permissionDenied ? "Bluetooth access" : "Nearby devices"}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      {permissionDenied ? (
        <div className="flex flex-1 flex-col justify-center gap-6 px-6">
          <p className="text-sm text-muted-foreground">
            Brume needs permission to find nearby devices so it can pair with your diffuser. No
            location data is collected.
          </p>
          <Button
            size="lg"
            className="h-14 w-full"
            onClick={() =>
              void ensureNativePermissions().then((granted) => setPermissionDenied(!granted))
            }
          >
            Allow Bluetooth
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-14 w-full"
            onClick={() => void openNativeAppSettings()}
          >
            <Settings className="mr-2 size-4" aria-hidden />
            Open app settings
          </Button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <p className="text-sm text-muted-foreground">
            Pick your diffuser, or wait and we connect it automatically once we recognise it.
          </p>
          <ul className="mt-5 divide-y divide-border border-y border-border">
            {devices.map((device) => (
              <li key={device.deviceId}>
                <button
                  type="button"
                  disabled={connectingId !== null}
                  onClick={() => void connect(device)}
                  className="flex w-full items-center justify-between gap-4 py-4 text-left disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{device.name}</span>
                  <span className="flex items-center gap-3 text-xs text-muted-foreground">
                    {connectingId === device.deviceId ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <>
                        {device.rssi} dBm
                        <Signal rssi={device.rssi} />
                      </>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {scanError && <p className="mt-8 text-sm text-destructive">{scanError}</p>}
          {!scanError && devices.length === 0 && (
            <div className="mt-8 space-y-3">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Searching for devices, double tap the diffuser button.
              </p>
              {slowScan && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Still nothing. Check that Bluetooth is on, that the diffuser LED is blinking,
                    and that nearby devices permission is allowed for Brume.
                  </p>
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-14 w-full"
                    onClick={() => void openNativeAppSettings()}
                  >
                    <Settings className="mr-2 size-4" aria-hidden />
                    Open app settings
                  </Button>
                </>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
