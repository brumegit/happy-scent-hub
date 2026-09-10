import { useHydrated } from "@/hooks/useHydrated";
import { useDebugMode, setDebugEnabled } from "@/hooks/useDebugMode";

/**
 * Champagne banner pinned to the bottom of the viewport while debug mode is on.
 * Tapping "Exit debug mode" turns it off everywhere (10 logo taps also toggle).
 */
export function DebugExitBanner() {
  const debug = useDebugMode();
  const hydrated = useHydrated();

  if (!hydrated || !debug) return null;

  return (
    <button
      type="button"
      onClick={() => setDebugEnabled(false)}
      className="fixed inset-x-0 bottom-0 z-[60] flex items-center justify-center gap-2 border-t border-gold bg-background px-4 py-3 text-center text-sm font-medium text-gold"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
    >
      <span className="h-2 w-2 rounded-full bg-gold" />
      Exit debug mode
    </button>
  );
}
