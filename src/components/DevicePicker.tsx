import { X } from "lucide-react";

import type { NativeDevice } from "@/lib/native-ble";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * In-app Bluetooth chooser, shown as a popup. Brume diffusers are listed first
 * and are the only selectable devices. A few other named devices nearby
 * (closest signal first) are shown so the user can see the scan is alive, but
 * they can never be picked, so customers don't pair the wrong device.
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
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="flex min-h-[56vh] w-[88vw] max-w-[88vw] flex-col border-border bg-background px-[8%] py-10">
        <div className="flex items-start justify-between gap-4">
          <DialogTitle className="font-display text-4xl leading-tight">Searching</DialogTitle>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="shrink-0 border border-destructive p-2 text-destructive"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <p className="mt-3 text-sm text-foreground">
          Double tap the button on the back of your diffuser to wake it, it appears as "BRUME". Keep
          your phone close.
        </p>

        <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
          {likely.length === 0 ? (
            <p className="text-sm text-foreground">Looking for your diffuser…</p>
          ) : (
            <ul className="space-y-3">
              {likely.map((device) => (
                <li key={device.deviceId}>
                  <button
                    type="button"
                    onClick={() => onSelect(device)}
                    className="w-full truncate border border-border bg-background px-4 py-4 text-left text-sm text-foreground"
                  >
                    {device.name}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {others.length > 0 && (
            <div className="mt-8">
              <p className="text-xs text-foreground">Nearby devices, closest first</p>
              <p className="mt-2 text-xs text-foreground">
                These aren't diffusers. Only a device named "BRUME" can connect.
              </p>
              <ul className="mt-3 space-y-3">
                {others.map((device) => (
                  <li
                    key={device.deviceId}
                    className="flex items-center justify-between gap-3 border border-border bg-background px-4 py-4 opacity-50"
                  >
                    <span className="truncate text-sm text-foreground">{device.name}</span>
                    <span className="shrink-0 text-xs text-foreground">Not a diffuser</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="mt-6 w-full border border-destructive bg-background px-4 py-4 text-sm tracking-[0.12em] text-destructive"
        >
          CANCEL
        </button>
      </DialogContent>
    </Dialog>
  );
}
