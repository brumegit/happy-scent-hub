import { Link } from "@tanstack/react-router";
import { Check, Sparkles } from "lucide-react";

import { useHydrated } from "@/hooks/useHydrated";
import { useIdentityStore } from "@/stores/identityStore";

export function GuestBanner() {
  const status = useIdentityStore((s) => s.status);
  const firstName = useIdentityStore((s) => s.firstName);
  const hydrated = useHydrated();

  if (!hydrated) return null;

  if (status === "matched") {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 w-full bg-success text-background">
        <div className="mx-auto flex min-h-[5rem] max-w-4xl items-center justify-center gap-2 px-4 py-4 text-center text-sm tracking-[0.06em]">
          <Check className="size-4" aria-hidden />
          <span className="font-semibold">
            Welcome back{firstName ? `, ${firstName}` : ""}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 w-full bg-destructive text-destructive-foreground">
      <div className="mx-auto flex min-h-[5rem] max-w-4xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-4 text-center text-sm tracking-[0.06em]">
        <span className="flex items-center gap-2">
          <Sparkles className="size-4" aria-hidden />
          You're in guest mode.
        </span>
        <Link to="/welcome" className="font-semibold underline underline-offset-4">
          Add the email used for your order
        </Link>
        <span className="hidden sm:inline">for a tailored experience.</span>
      </div>
    </div>
  );
}
