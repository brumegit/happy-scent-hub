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

/** Drift pace: 15 px/second. Uses sub-pixel transforms for smoothness. */
const DRIFT_SPEED = 0.015; // px/ms

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * One endlessly drifting row. Content is duplicated and moved via a sub-pixel
 * `transform: translateX` (browsers interpolate transforms smoothly, unlike
 * `scrollLeft` which snaps to whole pixels). Drift pauses while dragging.
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
  const trackRef = useRef<HTMLDivElement>(null);
  const paused = useRef(false);
  const posRef = useRef(0);
  const widthRef = useRef(0);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Measure one copy's width so we can wrap seamlessly.
    const measure = () => {
      widthRef.current = el.scrollWidth / 2;
    };
    measure();

    let raf = 0;
    let last = performance.now();
    let started = false;

    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const half = widthRef.current;
      if (half > 0 && !started) {
        posRef.current = direction === -1 ? -half : 0;
        el.style.transform = `translate3d(${posRef.current}px,0,0)`;
        started = true;
      }
      if (started && half > 0) {
        if (paused.current) {
          // Keep transform synced if needed (no change while paused).
        } else {
          posRef.current += direction * (dt * DRIFT_SPEED);
          if (posRef.current <= -half) posRef.current += half;
          if (posRef.current >= 0) posRef.current -= half;
          el.style.transform = `translate3d(${posRef.current}px,0,0)`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [direction]);

  return (
    <div
      // -mx-11 breaks out of the page's px-11 padding so badges bleed past the
      // screen edges; overflow hidden clips the duplicated track. h-11 matches
      // the room-name input height. The inner track uses translateX (sub-pixel
      // smooth) rather than scrollLeft (integer-jerky).
      className="-mx-11 h-11 overflow-hidden px-0"
    >
      <div
        ref={trackRef}
        className="flex h-11 gap-2 w-max will-change-transform"
      >
        {[...items, ...items].map((suggestion, index) => (
          <button
            key={`${suggestion}-${index}`}
            type="button"
            onClick={() => onPick(suggestion)}
            className="flex h-11 shrink-0 items-center rounded-[10px] border border-border px-2 py-1 text-base tracking-normal whitespace-nowrap text-muted-foreground transition-colors hover:border-foreground hover:text-foreground md:text-sm"
          >
            {suggestion}
          </button>
        ))}
      </div>
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
