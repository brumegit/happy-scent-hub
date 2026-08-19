import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatHourLabel, formatHourRanges } from "@/lib/diffuser";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

/**
 * Vertical 00:01 AM → 11:59 PM bar. Dragging a finger paints working hours in
 * champagne; dragging over a painted hour clears it.
 */
export function HourPainter({
  open,
  dayLabel,
  hours,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  dayLabel: string;
  hours: number[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (hours: number[]) => void;
}) {
  const [selected, setSelected] = useState<number[]>(hours);
  const painting = useRef<null | "add" | "remove">(null);

  // Reset local state whenever a new day is opened.
  const lastKey = useRef("");
  const key = `${dayLabel}:${open}`;
  if (key !== lastKey.current) {
    lastKey.current = key;
    if (open) setSelected(hours);
  }

  function apply(hour: number, mode: "add" | "remove") {
    setSelected((current) =>
      mode === "add"
        ? current.includes(hour)
          ? current
          : [...current, hour]
        : current.filter((h) => h !== hour),
    );
  }

  function start(hour: number) {
    const mode = selected.includes(hour) ? "remove" : "add";
    painting.current = mode;
    apply(hour, mode);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display uppercase">{dayLabel}</DialogTitle>
          <DialogDescription>
            Paint the hours the diffuser should run. Touch a painted hour to turn it off.
          </DialogDescription>
        </DialogHeader>

        <div
          className="select-none touch-none"
          onPointerUp={() => (painting.current = null)}
          onPointerLeave={() => (painting.current = null)}
        >
          <p className="eyebrow text-muted-foreground">12:01 AM</p>
          <div className="mt-2 flex flex-col border border-border">
            {HOURS.map((hour) => {
              const on = selected.includes(hour);
              return (
                <button
                  key={hour}
                  type="button"
                  aria-pressed={on}
                  aria-label={formatHourLabel(hour)}
                  onPointerDown={(event) => {
                    event.currentTarget.releasePointerCapture?.(event.pointerId);
                    start(hour);
                  }}
                  onPointerEnter={() => painting.current && apply(hour, painting.current)}
                  className={`flex h-8 items-center justify-between border-b border-border/60 px-3 text-xs transition-colors last:border-b-0 ${
                    on ? "bg-gold text-gold-foreground" : "bg-transparent text-muted-foreground"
                  }`}
                >
                  <span>{formatHourLabel(hour)}</span>
                  <span className="tracking-[0.18em]">{on ? "ON" : ""}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-right eyebrow text-muted-foreground">11:59 PM</p>
        </div>

        <p className="text-sm text-muted-foreground">{formatHourRanges(selected)}</p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm([...selected].sort((a, b) => a - b))}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
