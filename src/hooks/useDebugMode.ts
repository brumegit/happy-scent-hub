import { useEffect, useState } from "react";

const KEY = "brume-debug";
const EVENT = "brume-debug-changed";

export function isDebugEnabled() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setDebugEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (enabled) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable — debug mode simply stays off.
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function toggleDebugEnabled() {
  const next = !isDebugEnabled();
  setDebugEnabled(next);
  return next;
}

/** Reactive read of the hidden debug mode (10 taps on the logo). */
export function useDebugMode() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const sync = () => setEnabled(isDebugEnabled());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return enabled;
}
