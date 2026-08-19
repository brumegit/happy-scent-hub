import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { Intensity } from "@/lib/diffuser";

export type Diffuser = {
  id: string;
  name: string;
  device_id: string | null;
  intensity: Intensity;
  schedule_days: number[];
  start_time: string;
  end_time: string;
  schedule_active: boolean;
};

interface DiffuserState {
  diffusers: Diffuser[];
  hydrated: boolean;
  addDiffuser: (diffuser: Omit<Diffuser, "id">) => void;
  updateDiffuser: (id: string, patch: Partial<Diffuser>) => void;
  removeDiffuser: (id: string) => void;
}

export const useDiffuserStore = create<DiffuserState>()(
  persist(
    (set) => ({
      diffusers: [],
      hydrated: false,
      addDiffuser: (diffuser) =>
        set((state) => ({
          diffusers: [...state.diffusers, { ...diffuser, id: crypto.randomUUID() }],
        })),
      updateDiffuser: (id, patch) =>
        set((state) => ({
          diffusers: state.diffusers.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        })),
      removeDiffuser: (id) =>
        set((state) => ({ diffusers: state.diffusers.filter((d) => d.id !== id) })),
    }),
    {
      name: "brume-diffusers",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ diffusers: state.diffusers }),
      onRehydrateStorage: () => () => {
        useDiffuserStore.setState({ hydrated: true });
      },
    },
  ),
);
