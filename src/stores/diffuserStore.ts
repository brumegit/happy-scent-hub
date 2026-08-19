import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { defaultSchedule, type DaySchedule, type Intensity } from "@/lib/diffuser";

export type Diffuser = {
  id: string;
  name: string;
  room: string;
  device_id: string | null;
  intensity: Intensity;
  schedule: DaySchedule[];
  schedule_active: boolean;
  last_pushed_at: string | null;
  /** Exact settings acknowledged by the hardware on the last push. */
  last_pushed_intensity?: Intensity;
  last_pushed_schedule?: DaySchedule[];
};


interface DiffuserState {
  diffusers: Diffuser[];
  hydrated: boolean;
  addDiffuser: (diffuser: Omit<Diffuser, "id">) => void;
  updateDiffuser: (id: string, patch: Partial<Diffuser>) => void;
  removeDiffuser: (id: string) => void;
}

type LegacyDiffuser = Diffuser & {
  schedule_days?: number[];
  start_time?: string;
  end_time?: string;
};

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
      version: 3,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ diffusers: state.diffusers }),
      migrate: (persisted) => {
        const state = persisted as { diffusers?: LegacyDiffuser[] } | undefined;
        return {
          diffusers: (state?.diffusers ?? []).map((d) => {
            if (Array.isArray(d.schedule))
              return { ...d, room: d.room ?? "Living room", last_pushed_at: d.last_pushed_at ?? null };
            const start = Number(d.start_time?.split(":")[0] ?? 8);
            const end = Number(d.end_time?.split(":")[0] ?? 23);
            const hours = Array.from({ length: Math.max(end - start, 1) }, (_, i) => start + i);
            return {
              ...d,
              room: d.room ?? "Living room",
              last_pushed_at: d.last_pushed_at ?? null,
              schedule: defaultSchedule().map((day) => ({
                ...day,
                active: (d.schedule_days ?? [1, 2, 3, 4, 5]).includes(day.day),
                hours,
              })),
            };
          }),
        } as DiffuserState;
      },
      onRehydrateStorage: () => () => {
        useDiffuserStore.setState({ hydrated: true });
      },
    },
  ),
);
