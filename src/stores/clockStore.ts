import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ClockMode = "auto" | "12" | "24";

/**
 * Reads the 12h / 24h convention straight from the device (OS locale settings),
 * so US users get AM/PM and European users get 24-hour without configuring it.
 */
export function deviceUses24Hour() {
  try {
    const opts = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions();
    if (typeof opts.hour12 === "boolean") return !opts.hour12;
    return opts.hourCycle === "h23" || opts.hourCycle === "h24";
  } catch {
    return false;
  }
}

type ClockState = {
  mode: ClockMode;
  setMode: (mode: ClockMode) => void;
};

export const useClockStore = create<ClockState>()(
  persist(
    (set) => ({
      mode: "auto",
      setMode: (mode) => set({ mode }),
    }),
    {
      name: "brume-clock",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** True when times should be rendered as 24-hour. */
export function is24Hour() {
  const mode = useClockStore.getState().mode;
  return mode === "auto" ? deviceUses24Hour() : mode === "24";
}
