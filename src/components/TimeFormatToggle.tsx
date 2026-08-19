import { useClockStore, type ClockMode } from "@/stores/clockStore";

const OPTIONS: ClockMode[] = ["auto", "12", "24"];

/**
 * 12h / 24h preference. Reads from the shared clock store so the choice
 * persists across the setup wizard and the home editor. Rendered sticky at the
 * bottom of a screen, sitting just above the guest banner.
 */
export function TimeFormatToggle() {
  const clockMode = useClockStore((s) => s.mode);
  const setClockMode = useClockStore((s) => s.setMode);

  return (
    <div className="flex items-center justify-center gap-2 py-3 text-[11px] text-muted-foreground">
      <span>Time format</span>
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={clockMode === option}
          onClick={() => setClockMode(option)}
          className={`border bg-background px-2 py-1 transition-colors ${
            clockMode === option
              ? "border-muted-foreground text-foreground"
              : "border-border text-muted-foreground"
          }`}
        >
          {option === "auto" ? "Auto" : option === "12" ? "12 h" : "24 h"}
        </button>
      ))}
    </div>
  );
}
