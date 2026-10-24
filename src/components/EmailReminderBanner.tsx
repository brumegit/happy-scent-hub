import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getContactEmail } from "@/lib/customer-identity";

// Persistent nudge for customers who skipped the email step. Stays pinned to
// the bottom of setup until they add an email (red, hard to ignore, easy to
// act on by reopening the email entry sheet).
export function EmailReminderBanner({ stacked, onEmailSaved }: { stacked: boolean; onEmailSaved?: () => void }) {
  const [hasEmail, setHasEmail] = useState(true);
  const savedRef = useRef(onEmailSaved);
  savedRef.current = onEmailSaved;

  useEffect(() => {
    const sync = () => {
      const has = Boolean(getContactEmail());
      setHasEmail(has);
      if (has) savedRef.current?.();
    };
    sync();
    window.addEventListener("brume-email-saved", sync);
    return () => window.removeEventListener("brume-email-saved", sync);
  }, []);

  if (hasEmail) return null;

  return (
    <div
      className="fixed inset-x-0 z-40 bg-destructive"
      style={{ bottom: stacked ? "calc(env(safe-area-inset-bottom) + 7.5rem)" : "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-11 py-3">
        <p className="text-sm text-white">You’re in guest mode.</p>
        <Button
          variant="outline"
          className="h-10 shrink-0 border-white bg-transparent px-4 text-sm text-white hover:bg-transparent hover:text-white"
          data-add-email
          onClick={() => window.dispatchEvent(new CustomEvent("brume-open-email", { detail: { source: "guest_banner" } }))}
        >
          Add email
        </Button>
      </div>
    </div>
  );
}
