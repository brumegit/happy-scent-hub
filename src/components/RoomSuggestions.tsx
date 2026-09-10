import { useEffect, useMemo, useRef } from "react";

/** Generic home and workplace spaces offered as one-tap room names. */
const ROOM_SUGGESTIONS = [
  "Living room",
  "Bedroom",
  "Guest room",
  "Kitchen",
  "Dining room",
  "Bathroom",
  "Hallway",
  "Entryway",
  "Home office",
  "Office",
  "Reception",
  "Meeting room",
  "Lobby",
  "Store",
  "Waiting area",
  "Restroom",
  "Studio",
  "Lounge",
  "Corridor",
  "Stairway",
];

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * One endlessly drifting row. The list is rendered twice so scrollLeft can wrap
 * seamlessly, and the drift pauses while the user is dragging the row.
 */
function Row({
  items,
  direction,
  onPick,
}: {
  items: string[];
  direction: 1 | -1;
  onPick: (value: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const paused = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let last = performance.now();
    if (direction === -1) el.scrollLeft = el.scrollWidth / 2;

    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (!paused.current) {
        const half = el.scrollWidth / 2;
        // 0.004 px/ms — 5x slower than the previous 0.02 drift.
        let next = el.scrollLeft + direction * (dt * 0.004);
        if (next >= half) next -= half;
        if (next <= 0) next += half;
        el.scrollLeft = next;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [direction]);

  const hold = () => {
    paused.current = true;
  };
  const release = () => {
    paused.current = false;
  };

  return (
    <div
      ref={ref}
      onPointerDown={hold}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onTouchStart={hold}
      onTouchEnd={release}
      className="flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {[...items, ...items].map((suggestion, index) => (
        <button
          key={`${suggestion}-${index}`}
          type="button"
          onClick={() => onPick(suggestion)}
          className="shrink-0 rounded-[10px] border border-border px-3 py-1.5 text-xs whitespace-nowrap text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

/** Two independent drifting rows of quick-pick room names. */
export function RoomSuggestions({ onPick }: { onPick: (value: string) => void }) {
  const [top, bottom] = useMemo(() => {
    const shuffled = shuffle(ROOM_SUGGESTIONS);
    const mid = Math.ceil(shuffled.length / 2);
    return [shuffled.slice(0, mid), shuffled.slice(mid)];
  }, []);

  return (
    <div className="space-y-2 pt-2">
      <Row items={top} direction={1} onPick={onPick} />
      <Row items={bottom} direction={-1} onPick={onPick} />
    </div>
  );
}
