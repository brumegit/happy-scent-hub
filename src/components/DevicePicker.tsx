import { useState } from "react";
import { X } from "lucide-react";

import type { NativeDevice } from "@/lib/native-ble";

/**
 * In-app Bluetooth chooser. Likely Brume diffusers are listed first; unrelated
 * nearby devices (TVs, headphones…) stay hidden unless the user asks for them,
 * so customers don't pair the wrong device.
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
  const [showOthers, setShowOthers] = useState(false);
  const likely = devices.filter((d) => d.likely);
  const others = devices.filter((d) => !d.likely);

  const row = (device: NativeDevice) => (
    <li key={device.deviceId}>
      <button
        type="button"
        onClick={() => onSelect(device)}
        className="w-full truncate border border-border bg-background px-4 py-4 text-left text-sm"
      >
        {device.name}
      </button>
    </li>
  );

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      <div className="flex items-start justify-between gap-4 px-6 pt-[calc(env(safe-area-inset-top)+2rem)]">
        <div className="min-w-0">
          <h2 className="font-display text-2xl leading-tight">Searching</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your diffuser wasn't found yet. Double tap the button on the back of your diffuser to
            wake it — it appears as "BRUME". Keep your phone close.
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
          <ul className="space-y-3">{likely.map(row)}</ul>
        )}

        {others.length > 0 && (
          <div className="mt-8">
            <button
              type="button"
              onClick={() => setShowOthers((v) => !v)}
              className="text-xs text-muted-foreground underline"
            >
              {showOthers ? "Hide other devices" : `Other nearby devices (${others.length})`}
            </button>
            {showOthers && (
              <>
                <p className="mt-2 text-xs text-muted-foreground">
                  These are usually not diffusers. Only pick one if you're sure.
                </p>
                <ul className="mt-3 space-y-3 opacity-70">{others.map(row)}</ul>
              </>
            )}
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
