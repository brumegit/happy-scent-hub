import { Plus, Trash2 } from "lucide-react";

import {
  DAYS,
  MAX_TIMERS,
  blocksFromSchedule,
  blocksToSchedule,
  minutesToTimeValue,
  routineName,
  timeValueToMinutes,
  type DaySchedule,
  type TimeBlock,
} from "@/lib/diffuser";

/**
 * Routine editor: the schedule is a list of routines, and one routine is
 * exactly one hardware working mode. The device stores 5, so the editor caps
 * the list at 5 — the limit is a design constraint, never a validation error.
 *
 * Routines are never numbered. Once a configuration is confirmed, each routine
 * is named from what it is (days + part of the day) so it reads back naturally
 * the next time it's opened.
 *
 * Times are minute-accurate (0–1439 minutes of the day): the native time input
 * lets the user pick any minute, and the ScentLife timer frames carry
 * startMinute / endMinute straight through, so 07:45 → 20:10 is pushed as is.
 */
export function ScheduleGrid({
  schedule,
  onChange,
  showNames = true,
}: {
  schedule: DaySchedule[];
  onChange: (schedule: DaySchedule[]) => void;
  showNames?: boolean;
}) {
  const blocks = blocksFromSchedule(schedule);

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
    // A routine with no day left would silently vanish; keep at least one.
    if (days.length === 0) return;
    patch(index, { days });
  }

  function renderDay(block: TimeBlock, index: number, value: number) {
    const day = DAYS[value];
    if (!day) return null;
    const on = block.days.includes(value);
    return (
      <button
        key={value}
        type="button"
        aria-pressed={on}
        aria-label={day.long}
        onClick={() => toggleDay(index, value)}
        className={`h-12 border bg-background text-center text-[11px] leading-tight transition-colors ${
          on ? "border-gold text-gold" : "border-border text-muted-foreground"
        }`}
      >
        {day.long}
      </button>
    );
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        const named = showNames;
        return (
          <div key={index} className="border border-border p-4">
            {(named || blocks.length > 1) && (
              <>
                <div className="flex min-h-6 items-center justify-between">
                  <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {routineName(block)}
                  </span>
                  {blocks.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove ${named ? routineName(block) : "this routine"}`}
                      onClick={() => commit(blocks.filter((_, i) => i !== index))}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  )}
                </div>
                <div className="mt-3 h-px w-full bg-border" />
              </>
            )}

            {/* Times first — minute granularity through the device's native picker.
                The two selectors share the full row width equally so the line is
                balanced and stretches edge to edge. */}
            <div className="mt-4 flex items-center gap-4">
              <label className="flex flex-1 items-center gap-2 text-sm text-muted-foreground">
                <span>Starts</span>
                <input
                  type="time"
                  step={60}
                  value={minutesToTimeValue(block.start)}
                  onChange={(e) => {
                    const start = timeValueToMinutes(e.target.value);
                    patch(index, { start, end: Math.max(block.end, Math.min(1439, start + 1)) });
                  }}
                  className="h-11 min-w-0 flex-1 border border-border bg-background px-2 text-sm text-foreground"
                />
              </label>
              <label className="flex flex-1 items-center gap-2 text-sm text-muted-foreground">
                <span>Stops</span>
                <input
                  type="time"
                  step={60}
                  value={minutesToTimeValue(block.end)}
                  onChange={(e) => {
                    const end = timeValueToMinutes(e.target.value);
                    patch(index, { end, start: Math.min(block.start, Math.max(0, end - 1)) });
                  }}
                  className="h-11 min-w-0 flex-1 border border-border bg-background px-2 text-sm text-foreground"
                />
              </label>
            </div>

            {/*
              Day selection: full day names. The five weekdays sit on the first
              row, Saturday and Sunday on the second, so the chip layout mirrors
              how people read a work week versus the weekend.
            */}
            <div className="mt-4 grid grid-cols-5 gap-1">
              {[1, 2, 3, 4, 5].map((value) => renderDay(block, index, value))}
            </div>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {[6, 0].map((value) => renderDay(block, index, value))}
            </div>
          </div>
        );
      })}

      {blocks.length < MAX_TIMERS ? (
        <button
          type="button"
          onClick={() => commit([...blocks, { start: 8 * 60, end: 20 * 60, days: [1, 2, 3, 4, 5] }])}
          className="flex w-full items-center justify-center gap-3 border border-border bg-background px-6 py-4 text-sm uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground"
        >
          <Plus className="size-4" aria-hidden />
          Add a routine
        </button>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          Your diffuser stores {MAX_TIMERS} routines — the maximum is reached.
        </p>
      )}

    </div>
  );
}
