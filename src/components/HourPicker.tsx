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

const PRESETS: { label: string; hours: number[] }[] = [
  { label: "Always on", hours: HOURS },
  { label: "Daytime", hours: range(8, 20) },
  { label: "Business", hours: range(9, 18) },
  { label: "Evening", hours: range(17, 23) },
];

function range(start: number, end: number) {
  return HOURS.filter((h) => h >= start && h < end);
}

/**
 * Hour selection for one day: quick presets, an explicit start/end range, and a
 * tappable 24-hour grid for fine tuning. Selected hours are champagne.
 */
export function HourPicker({
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

  // Reset local state whenever a new day is opened.
  const lastKey = useRef("");
  const key = `${dayLabel}:${open}`;
  if (key !== lastKey.current) {
    lastKey.current = key;
    if (open) setSelected(hours);
  }

  const sorted = [...selected].sort((a, b) => a - b);
  const start = sorted[0] ?? 0;
  const end = (sorted[sorted.length - 1] ?? 23) + 1;

  function setRange(nextStart: number, nextEnd: number) {
    const from = Math.min(nextStart, nextEnd - 1);
    setSelected(range(from, nextEnd));
  }

  function toggle(hour: number) {
    setSelected((current) =>
      current.includes(hour) ? current.filter((h) => h !== hour) : [...current, hour],
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{dayLabel}</DialogTitle>
          <DialogDescription>
            Choose a preset, set a start and end time, or tap single hours to fine tune.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-2">
          {PRESETS.map((preset) => {
            const on = preset.hours.join(",") === sorted.join(",");
            return (
              <button
                key={preset.label}
                type="button"
                aria-pressed={on}
                onClick={() => setSelected(preset.hours)}
                className={`border bg-background px-2 py-2 text-xs transition-colors ${
                  on ? "border-gold text-gold" : "border-border text-muted-foreground"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>Start</span>
            <select
              value={start}
              onChange={(e) => setRange(Number(e.target.value), end)}
              className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {formatHourLabel(h)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>End</span>
            <select
              value={end}
              onChange={(e) => setRange(start, Number(e.target.value))}
              className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              {HOURS.slice(1).concat(24).map((h) => (
                <option key={h} value={h}>
                  {formatHourLabel(h)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {HOURS.map((hour) => {
            const on = selected.includes(hour);
            return (
              <button
                key={hour}
                type="button"
                aria-pressed={on}
                aria-label={formatHourLabel(hour)}
                onClick={() => toggle(hour)}
                className={`border bg-background py-2 text-[11px] transition-colors ${
                  on ? "border-gold text-gold" : "border-border text-muted-foreground"
                }`}
              >
                {formatHourLabel(hour).replace(":00 ", " ")}
              </button>
            );
          })}
        </div>

        <p className="text-center text-sm text-muted-foreground">{formatHourRanges(selected)}</p>

        <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
          <span>Time format</span>
          {(["auto", "12", "24"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={clockMode === option}
              onClick={() => setClockMode(option)}
              className={`border bg-background px-2 py-1 transition-colors ${
                clockMode === option ? "border-gold text-gold" : "border-border text-muted-foreground"
              }`}
            >
              {option === "auto" ? "Auto" : option === "12" ? "12 h" : "24 h"}
            </button>
          ))}
        </div>


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
