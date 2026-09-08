import { X } from "lucide-react";

import type { NativeDevice } from "@/lib/native-ble";

/**
 * In-app Bluetooth chooser. Replaces the system dialog, which lists every
 * nameless peripheral around and overlaps its own rows on iOS.
 */
export function DevicePicker({
  devices,
  onSelect,
  onCancel,
}: {
  devices: NativeDevice[];
  onSelect: (device: NativeDevice) => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      <div className="flex items-start justify-between gap-4 px-6 pt-[calc(env(safe-area-inset-top)+2rem)]">
        <div className="min-w-0">
          <h2 className="font-display text-2xl leading-tight">Searching</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Double tap your diffuser button to enter pairing mode and edit settings.
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
        {devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Looking for nearby diffusers…</p>
        ) : (
          <ul className="space-y-3">
            {devices.map((device) => (
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
