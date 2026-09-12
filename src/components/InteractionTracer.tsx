import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

import { installSystemLogCapture, trace } from "@/lib/ble-log";
import { useDebugMode } from "@/hooks/useDebugMode";

/** Short human label for the element the user touched. */
function describe(el: Element): string {
  // Many app controls (day chips, hour cells, tiles) are plain divs with an
  // onClick — climb up to 4 ancestors to find the meaningful tap target.
  let target = el.closest(
    "button, a, [role=button], input, select, textarea, label, summary, [data-trace]",
  ) as HTMLElement | null;
  if (!target) {
    let node = el as HTMLElement | null;
    for (let depth = 0; node && depth < 4; depth += 1) {
      const text = (node.innerText || "").trim();
      if (text && text.length <= 60) {
        target = node;
        break;
      }
      node = node.parentElement;
    }
    target = target ?? (el as HTMLElement);
  }

  const tag = target.tagName.toLowerCase();
  const aria = target.getAttribute("aria-label");
  const traceLabel = target.getAttribute("data-trace");
  const name = (target as HTMLInputElement).name;
  const type = target.getAttribute("type");
  const text = (target.innerText || target.textContent || "").trim().replace(/\s+/g, " ");
  const label =
    traceLabel || aria || text || (target as HTMLInputElement).placeholder || name || "";

  return `${tag}${type ? `[${type}]` : ""}${label ? ` "${label.slice(0, 48)}"` : ""}`;
}

/**
 * Records what the user tapped and which screen they are on, so a Bluetooth
 * trace can be read alongside the actions that produced it. Debug mode only.
 */
export function InteractionTracer() {
  const debug = useDebugMode();
  const path = useRouterState({ select: (s) => s.location.href });

  useEffect(() => {
    if (!debug) return;
    trace(`👆 screen ${path}`);
  }, [debug, path]);

  useEffect(() => {
    if (!debug) return;

    const onPointer = (event: PointerEvent) => {
      const el = event.target as Element | null;
      if (!el) return;
      trace(`👆 tap ${describe(el)} @ ${window.location.pathname}`);
    };

    const onChange = (event: Event) => {
      const el = event.target as HTMLInputElement | null;
      if (!el || !el.tagName) return;
      const secret = el.type === "password";
      const value = secret ? "•••" : String(el.value ?? "").slice(0, 32);
      trace(`👆 change ${describe(el)} = "${value}"`);
    };

    // Backgrounding is a common cause of iOS dropping a Bluetooth session, and
    // it is only visible in Xcode otherwise — record it in the trace too.
    const onVisibility = () => trace(`📱 app ${document.visibilityState}`);
    const onPageHide = () => trace("📱 app hidden (pagehide)");

    installSystemLogCapture();
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [debug]);

  return null;
}
