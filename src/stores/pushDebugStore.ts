import { create } from "zustand";

/**
 * Development-only report of what the diffuser actually confirmed on the last
 * settings push. Not persisted — it reflects the current session only.
 */
export type PushStepKey = "name" | "modes" | "intensity" | "schedule";

export type PushStepStatus = "idle" | "pending" | "ok" | "unconfirmed" | "fail";

export type PushStep = {
  status: PushStepStatus;
  detail?: string;
};

type PushDebugState = {
  visible: boolean;
  startedAt: string | null;
  linkError: string | null;
  steps: Record<PushStepKey, PushStep>;
  log: string[];
  begin: () => void;
  set: (key: PushStepKey, status: PushStepStatus, detail?: string) => void;
  setLinkError: (message: string | null) => void;
  addLog: (line: string) => void;
  toggle: () => void;
};

const idleSteps = (): Record<PushStepKey, PushStep> => ({
  name: { status: "idle" },
  modes: { status: "idle" },
  intensity: { status: "idle" },
  schedule: { status: "idle" },
});

export const PUSH_STEP_LABELS: Record<PushStepKey, string> = {
  name: "Device name",
  modes: "Working modes",
  intensity: "Intensity",
  schedule: "Schedule",
};

export const usePushDebugStore = create<PushDebugState>()((set) => ({
  visible: true,
  startedAt: null,
  linkError: null,
  steps: idleSteps(),
  log: [],
  begin: () =>
    set({
      startedAt: new Date().toISOString(),
      linkError: null,
      steps: {
        name: { status: "pending" },
        modes: { status: "pending" },
        intensity: { status: "pending" },
        schedule: { status: "pending" },
      },
      log: [],
    }),
  set: (key, status, detail) =>
    set((state) => ({ steps: { ...state.steps, [key]: { status, detail } } })),
  setLinkError: (message) => set({ linkError: message }),
  addLog: (line) => set((state) => ({ log: [...state.log.slice(-40), line] })),
  toggle: () => set((state) => ({ visible: !state.visible })),
}));

export function pushDebug() {
  return usePushDebugStore.getState();
}
