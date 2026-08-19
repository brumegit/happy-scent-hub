import { useState } from "react";

import { HourPainter } from "@/components/HourPainter";
import { Switch } from "@/components/ui/switch";
import { DAYS, formatHourRanges, type DaySchedule } from "@/lib/diffuser";

/** 7 rows: day / active / working hours. */
export function ScheduleGrid({
  schedule,
  onChange,
}: {
  schedule: DaySchedule[];
  onChange: (schedule: DaySchedule[]) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const editingDay = schedule.find((d) => d.day === editing);

  function patch(day: number, value: Partial<DaySchedule>) {
    onChange(schedule.map((d) => (d.day === day ? { ...d, ...value } : d)));
  }

  return (
    <div className="border border-border">
      {schedule.map((day) => (
        <div
          key={day.day}
          className="grid grid-cols-[4.5rem_3rem_1fr] items-center gap-2 border-b border-border/60 px-3 py-3 last:border-b-0"
        >
          <span className="text-sm uppercase tracking-[0.14em]">{DAYS[day.day]?.short}</span>
          <Switch
            checked={day.active}
            aria-label={`Enable ${DAYS[day.day]?.long}`}
            onCheckedChange={(checked) => patch(day.day, { active: checked })}
          />
          <button
            type="button"
            onClick={() => setEditing(day.day)}
            disabled={!day.active}
            className={`truncate border border-border px-3 py-2 text-left text-xs transition-colors ${
              day.active
                ? "text-foreground hover:bg-secondary/60"
                : "text-muted-foreground/50"
            }`}
          >
            {formatHourRanges(day.hours)}
          </button>
        </div>
      ))}

      <HourPainter
        open={editing !== null}
        dayLabel={editing !== null ? (DAYS[editing]?.long ?? "") : ""}
        hours={editingDay?.hours ?? []}
        onOpenChange={(open) => !open && setEditing(null)}
        onConfirm={(hours) => {
          if (editing !== null) patch(editing, { hours });
          setEditing(null);
        }}
      />
    </div>
  );
}
