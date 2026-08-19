import { Plus, Trash2 } from "lucide-react";

import {
  DAYS,
  MAX_TIMERS,
  blocksFromSchedule,
  blocksToSchedule,
  formatHourLabel,
  type DaySchedule,
  type TimeBlock,
} from "@/lib/diffuser";
import { useClockStore } from "@/stores/clockStore";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

/**
 * Block editor: the schedule is a list of time blocks, and one block is exactly
 * one hardware working mode. The device stores 5, so the editor caps the list at
 * 5 — the limit is a design constraint, never a validation error.
 */
export function ScheduleGrid({
  schedule,
  onChange,
}: {
  schedule: DaySchedule[];
  onChange: (schedule: DaySchedule[]) => void;
}) {
  const blocks = blocksFromSchedule(schedule);
  const clockMode = useClockStore((s) => s.mode);
  const setClockMode = useClockStore((s) => s.setMode);

  function commit(next: TimeBlock[]) {
    onChange(blocksToSchedule(next.filter((b) => b.days.length > 0 && b.end > b.start)));
  }

  function patch(index: number, value: Partial<TimeBlock>) {
    commit(blocks.map((b, i) => (i === index ? { ...b, ...value } : b)));
  }

  function toggleDay(index: number, day: number) {
    const block = blocks[index]!;
    const days = block.days.includes(day)
      ? block.days.filter((d) => d !== day)
      : [...block.days, day].sort((a, b) => a - b);
    // A block with no day left would silently vanish; keep at least one.
    if (days.length === 0) return;
    patch(index, { days });
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => (
        <div key={index} className="border border-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Time block {index + 1}
            </span>
            {blocks.length > 1 && (
              <button
                type="button"
                aria-label={`Remove time block ${index + 1}`}
                onClick={() => commit(blocks.filter((_, i) => i !== index))}
                className="text-muted-foreground transition-colors hover:text-destructive"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            )}
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1">
            {DAYS.map((day) => {
              const on = block.days.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  aria-pressed={on}
                  aria-label={day.long}
                  onClick={() => toggleDay(index, day.value)}
                  className={`border bg-background py-2 text-[11px] transition-colors ${
                    on ? "border-gold text-gold" : "border-border text-muted-foreground"
                  }`}
                >
                  {day.short}
                </button>
              );
            })}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Start</span>
              <select
                value={block.start}
                onChange={(e) => {
                  const start = Number(e.target.value);
                  patch(index, { start, end: Math.max(block.end, start + 1) });
                }}
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
                value={block.end}
                onChange={(e) => {
                  const end = Number(e.target.value);
                  patch(index, { end, start: Math.min(block.start, end - 1) });
                }}
                className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {HOURS.slice(1)
                  .concat(24)
                  .map((h) => (
                    <option key={h} value={h}>
                      {formatHourLabel(h)}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        </div>
      ))}

      {blocks.length < MAX_TIMERS ? (
        <button
          type="button"
          onClick={() => commit([...blocks, { start: 8, end: 20, days: [1, 2, 3, 4, 5] }])}
          className="flex w-full items-center justify-center gap-2 border border-border bg-background px-3 py-3 text-xs uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground"
        >
          <Plus className="size-4" aria-hidden />
          Add a time block
        </button>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          Your diffuser stores {MAX_TIMERS} time blocks — the maximum is reached.
        </p>
      )}

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
    </div>
  );
}
