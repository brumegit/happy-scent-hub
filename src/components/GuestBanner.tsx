import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

import { useHydrated } from "@/hooks/useHydrated";
import { useIdentityStore } from "@/stores/identityStore";

export function GuestBanner() {
  const status = useIdentityStore((s) => s.status);
  const hydrated = useHydrated();

  if (!hydrated || status === "matched") return null;

  return (
    <div className="sticky top-0 z-50 w-full bg-gold text-gold-foreground">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-xs tracking-[0.06em]">
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
