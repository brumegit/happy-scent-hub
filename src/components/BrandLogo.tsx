import { useRef } from "react";
import logo from "@/assets/brume-logo.svg";
import { toggleDebugEnabled } from "@/hooks/useDebugMode";
import { toast } from "sonner";

/**
 * Brand logo. Tapping it 10 times in a row (within 3s between taps) toggles the
 * hidden debug mode, which reveals the Bluetooth read/push diagnostics strips.
 */
export function BrandLogo({ className = "h-6" }: { className?: string }) {
  const taps = useRef(0);
  const last = useRef(0);

  const handleTap = () => {
    const now = Date.now();
    taps.current = now - last.current > 3000 ? 1 : taps.current + 1;
    last.current = now;
    if (taps.current >= 10) {
      taps.current = 0;
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
