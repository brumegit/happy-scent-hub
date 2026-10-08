import { X } from "lucide-react";

import type { NativeDevice } from "@/lib/native-ble";

/**
 * In-app Bluetooth chooser. Brume diffusers are listed first and are the only
 * selectable devices. A few other named devices nearby (closest signal first)
 * are shown greyed out so the user can see the scan is alive, but they can
 * never be picked, so customers don't pair the wrong device.
 */

/** How many non-diffuser devices to show, proof of scanning, not a full list. */
const MAX_OTHERS = 5;

export function DevicePicker({
  devices,
  onSelect,
  onCancel,
}: {
  devices: NativeDevice[];
  onSelect: (device: NativeDevice) => void;
  onCancel: () => void;
}) {
  const likely = devices.filter((d) => d.likely);
  const others = devices
    .filter((d) => !d.likely)
    .sort((a, b) => (b.rssi ?? -100) - (a.rssi ?? -100))
    .slice(0, MAX_OTHERS);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      <div className="flex items-start justify-between gap-4 px-6 pt-[calc(env(safe-area-inset-top)+2rem)]">
        <div className="min-w-0">
          <h2 className="font-display text-2xl leading-tight">Searching</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your diffuser wasn't found yet. Double tap the button on the back of your diffuser to
            wake it, it appears as "BRUME". Keep your phone close.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="shrink-0 border border-destructive p-2 text-destructive"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-6">
        {likely.length === 0 ? (
          <p className="text-sm text-muted-foreground">Looking for your diffuser…</p>
        ) : (
          <ul className="space-y-3">
            {likely.map((device) => (
              <li key={device.deviceId}>
                <button
                  type="button"
                  onClick={() => onSelect(device)}
                  className="w-full truncate border border-border bg-background px-4 py-4 text-left text-sm"
                >
                  {device.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        {others.length > 0 && (
          <div className="mt-8">
            <p className="text-xs text-muted-foreground">Nearby devices, closest first</p>
            <p className="mt-2 text-xs text-muted-foreground">
              These aren't diffusers. Only a device named "BRUME" can connect.
            </p>
            <ul className="mt-3 space-y-3">
              {others.map((device) => (
                <li
                  key={device.deviceId}
                  className="flex items-center justify-between gap-3 border border-border bg-background px-4 py-4 opacity-50"
                >
                  <span className="truncate text-sm">{device.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">Not a diffuser</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="px-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        <button
          type="button"
          onClick={onCancel}
          className="w-full border border-destructive bg-background px-4 py-4 text-sm tracking-[0.12em] text-destructive"
        >
          CANCEL
        </button>
      </div>
    </div>
  );
}
