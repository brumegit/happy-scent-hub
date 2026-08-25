import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

import { EmailMatchDialog } from "@/components/EmailMatchDialog";
import { useHydrated } from "@/hooks/useHydrated";
import { useIdentityStore } from "@/stores/identityStore";

export function GuestBanner() {
  const status = useIdentityStore((s) => s.status);
  const firstName = useIdentityStore((s) => s.firstName);
  const hydrated = useHydrated();
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);

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
    <>
      {open && <EmailMatchDialog onClose={() => setOpen(false)} />}
      <div className="fixed bottom-0 left-0 right-0 z-50 w-full bg-destructive text-destructive-foreground">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-2 pl-4 pr-2 text-sm tracking-[0.06em]">
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-2">
            <span>You're in guest mode.</span>
            <button
              type="button"
              className="font-normal underline underline-offset-4"
              onClick={() => setOpen(true)}
            >
              Add your email
            </button>
          </div>
          <button
            type="button"
            aria-label="Close guest message"
            className="flex size-10 shrink-0 items-center justify-center text-destructive-foreground"
            onClick={() => {
              sessionStorage.setItem("brume-guest-banner-dismissed", "true");
              setDismissed(true);
            }}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      </div>
    </>
  );
}
