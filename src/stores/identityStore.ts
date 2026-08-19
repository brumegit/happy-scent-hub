import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type IdentityStatus = "guest" | "matched";

interface IdentityState {
  email: string | null;
  status: IdentityStatus;
  firstName: string | null;
  orderCount: number;
  hydrated: boolean;
  setMatched: (payload: { email: string; firstName: string | null; orderCount: number }) => void;
  /** Keeps the typed email (for support/debug) while staying unmatched. */
  setGuest: (email?: string | null) => void;
  reset: () => void;
}

export const useIdentityStore = create<IdentityState>()(
  persist(
    (set) => ({
      email: null,
      status: "guest",
      firstName: null,
      orderCount: 0,
      hydrated: false,
      setMatched: ({ email, firstName, orderCount }) =>
        set({ email, firstName, orderCount, status: "matched" }),
      setGuest: () => set({ email: null, firstName: null, orderCount: 0, status: "guest" }),
      reset: () => set({ email: null, firstName: null, orderCount: 0, status: "guest" }),
    }),
    {
      name: "brume-identity",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        email: state.email,
        status: state.status,
        firstName: state.firstName,
        orderCount: state.orderCount,
      }),
      onRehydrateStorage: () => (state) => {
        state?.hydrated;
        useIdentityStore.setState({ hydrated: true });
      },
    },
  ),
);

/** Email tied to the customer's purchase history, if we matched one. */
export function getIdentityEmail(): string | null {
  return useIdentityStore.getState().email;
}
