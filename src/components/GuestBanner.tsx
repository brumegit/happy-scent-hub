import { useEffect, useState } from "react";
import { Check, Sparkles, X } from "lucide-react";

import { useHydrated } from "@/hooks/useHydrated";
import { useIdentityStore } from "@/stores/identityStore";

export function GuestBanner() {
  const status = useIdentityStore((s) => s.status);
  const firstName = useIdentityStore((s) => s.firstName);
  const hydrated = useHydrated();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(sessionStorage.getItem("brume-guest-banner-dismissed") === "true");
  }, []);

  if (!hydrated || dismissed) return null;

  if (status === "matched") {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 w-full bg-success text-background">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-center gap-2 px-4 text-center text-sm tracking-[0.06em]">
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
       <div className="relative mx-auto flex min-h-14 max-w-4xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-12 py-3 text-center text-sm tracking-[0.06em]">
        <span className="flex items-center gap-2">
          <Sparkles className="size-4" aria-hidden />
          You're in guest mode.
        </span>
         <span className="font-normal underline underline-offset-4">Add your email</span>
        <span className="hidden sm:inline">for a tailored experience.</span>
         <button
           type="button"
           aria-label="Close guest message"
           className="absolute right-3 flex size-10 items-center justify-center text-destructive-foreground"
           onClick={() => {
             sessionStorage.setItem("brume-guest-banner-dismissed", "true");
             setDismissed(true);
           }}
         >
           <X className="size-5" aria-hidden />
         </button>
      </div>
    </div>
  );
}
