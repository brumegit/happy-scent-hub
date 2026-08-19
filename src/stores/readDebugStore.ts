import { create } from "zustand";

/**
 * Development-only report of what we managed to READ from the diffuser right
 * after pairing (before the user picks intensity / schedule).
 */
export type ReadStepKey = "link" | "modes" | "intensity" | "schedule";

export type ReadStepStatus = "idle" | "pending" | "ok" | "unconfirmed" | "fail";

export type ReadStep = { status: ReadStepStatus; detail?: string };

type ReadDebugState = {
  startedAt: string | null;
  steps: Record<ReadStepKey, ReadStep>;
  log: string[];
  begin: () => void;
  set: (key: ReadStepKey, status: ReadStepStatus, detail?: string) => void;
  addLog: (line: string) => void;
};

export const READ_STEP_LABELS: Record<ReadStepKey, string> = {
  link: "Link",
  modes: "Working modes",
  intensity: "Intensity",
  schedule: "Schedule",
};

const pendingSteps = (): Record<ReadStepKey, ReadStep> => ({
  link: { status: "pending" },
  modes: { status: "pending" },
  intensity: { status: "pending" },
  schedule: { status: "pending" },
});

export const useReadDebugStore = create<ReadDebugState>()((set) => ({
  startedAt: null,
  steps: {
    link: { status: "idle" },
    modes: { status: "idle" },
    intensity: { status: "idle" },
    schedule: { status: "idle" },
  },
  log: [],
  begin: () => set({ startedAt: new Date().toISOString(), steps: pendingSteps(), log: [] }),
  set: (key, status, detail) =>
    set((state) => ({ steps: { ...state.steps, [key]: { status, detail } } })),
  addLog: (line) => set((state) => ({ log: [...state.log.slice(-40), line] })),
}));

export function readDebug() {
  return useReadDebugStore.getState();
}
