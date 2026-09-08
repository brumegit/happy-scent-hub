import { useEffect, useRef } from "react";

/**
 * A native-feeling scroll wheel: the values snap under a centred window and the
 * phone ticks (haptic on native, vibration on the web) at each new value.
 */
async function tick() {
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    navigator.vibrate?.(8);
  }
}

const ITEM_HEIGHT = 40;

export function WheelPicker({
  min,
  max,
  step,
  value,
  onChange,
  suffix = "",
  label,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  label: string;
}) {
  const values: number[] = [];
  for (let v = min; v <= max; v += step) values.push(v);

  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmitted = useRef(value);
  const scrolling = useRef(false);

  // Keep the wheel aligned with the value whenever it changes from outside.
  useEffect(() => {
    const el = ref.current;
    if (!el || scrolling.current) return;
    const index = Math.max(0, Math.round((value - min) / step));
    el.scrollTop = index * ITEM_HEIGHT;
  }, [value, min, step]);

  function handleScroll() {
    const el = ref.current;
    if (!el) return;
    scrolling.current = true;
    const index = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ITEM_HEIGHT)));
    const next = values[index]!;
    if (next !== lastEmitted.current) {
      lastEmitted.current = next;
      void tick();
      onChange(next);
    }
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      scrolling.current = false;
    }, 160);
  }

  return (
    <div className="flex-1">
      <p className="mb-2 text-center text-xs uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div className="relative h-[120px] overflow-hidden border border-border">
        <div
          className="pointer-events-none absolute inset-x-0 top-[40px] h-[40px] border-y border-gold/60"
          aria-hidden
        />
        <div
          ref={ref}
          onScroll={handleScroll}
          role="listbox"
          aria-label={label}
          className="h-full snap-y snap-mandatory overflow-y-scroll [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ paddingTop: ITEM_HEIGHT, paddingBottom: ITEM_HEIGHT }}
        >
          {values.map((v) => (
            <div
              key={v}
              className={`flex h-[40px] snap-center items-center justify-center text-lg tabular-nums ${
                v === value ? "text-gold" : "text-muted-foreground"
              }`}
            >
              {v}
              {suffix}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
