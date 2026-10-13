import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getContactEmail, saveContactEmail } from "@/lib/customer-identity";
import { identifyHotjar } from "@/lib/hotjar";

// Persistent nudge for customers who skipped the email step. Stays pinned to
// the bottom of setup until they add an email (red, hard to ignore, easy to
// act on by reopening the email entry sheet).
export function EmailReminderBanner({ stacked }: { stacked: boolean }) {
  const [hasEmail, setHasEmail] = useState(true);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setHasEmail(Boolean(getContactEmail())); }, []);

  if (hasEmail) return null;

  return (
    <>
      <div
        className="fixed inset-x-0 z-40 bg-destructive"
        style={{ bottom: stacked ? "calc(env(safe-area-inset-bottom) + 7.5rem)" : "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-11 py-3">
          <p className="text-sm text-white">You’re in guest mode.</p>
          <Button
            variant="outline"
            className="h-10 shrink-0 border-white bg-transparent px-4 text-sm text-white hover:bg-transparent"
            onClick={() => { setEmail(getContactEmail() ?? ""); setOpen(true); }}
          >
            Connect
          </Button>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[88vw] max-w-md border-border bg-background px-8 py-10" onCloseAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl leading-tight text-foreground">Add your email</DialogTitle>
            <DialogDescription className="text-sm text-foreground">Use the email from your Brume order so we can tailor your experience.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => {
            event.preventDefault();
            if (!saveContactEmail(email)) {
              setError("Enter a valid email address.");
              inputRef.current?.focus();
              return;
            }
            identifyHotjar(getContactEmail());
            setHasEmail(true);
            setOpen(false);
          }} noValidate>
            <Input ref={inputRef} type="email" aria-label="Email address" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} aria-invalid={Boolean(error)} aria-describedby={error ? "banner-email-error" : undefined} className="mt-3 h-12 text-base" />
            {error && <p id="banner-email-error" role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
            <Button type="submit" variant="outline" className="mt-8 h-12 w-full">Continue</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
