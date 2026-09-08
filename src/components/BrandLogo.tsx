import logo from "@/assets/brume-logo.svg";
import { toggleDebugEnabled } from "@/hooks/useDebugMode";
import { toast } from "sonner";

/**
 * Brand logo. Tapping it 10 times in a row (within 3s between taps) toggles the
 * hidden debug mode, which reveals the Bluetooth read/push diagnostics strips.
 */
// Module-level so the count survives re-renders and page changes: ten taps
// switch debug mode on, ten more switch it back off.
let taps = 0;
let last = 0;

export function BrandLogo({ className = "h-6" }: { className?: string }) {

  const handleTap = () => {
    const now = Date.now();
    taps = now - last > 3000 ? 1 : taps + 1;
    last = now;
    if (taps >= 10) {
      taps = 0;
      const enabled = toggleDebugEnabled();
      toast(enabled ? "Debug mode on" : "Debug mode off");
    }
  };

  return (
    <img
      src={logo}
      alt="Brume"
      onClick={handleTap}
      className={`w-auto ${className}`}
      style={{ filter: "brightness(0) invert(1)" }}
    />
  );
}
