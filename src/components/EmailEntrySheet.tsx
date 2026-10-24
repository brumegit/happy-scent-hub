import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getContactEmail, saveContactEmail } from "@/lib/customer-identity";
import { identifyHotjar } from "@/lib/hotjar";
import { declareEmail } from "@/lib/analytics";

// Email entry sheet, mounted once in the root layout so the guest banner and
// the inbox bell can open it from any screen.
export function EmailEntrySheet() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const sourceRef = useRef("guest_banner");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const openSheet = (event: Event) => {
      const detail = (event as CustomEvent).detail as { source?: string } | undefined;
      sourceRef.current = detail?.source ?? "guest_banner";
      setEmail(getContactEmail() ?? "");
      setError("");
      setOpen(true);
    };
    window.addEventListener("brume-open-email", openSheet);
    return () => window.removeEventListener("brume-open-email", openSheet);
  }, []);

  return (
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
          declareEmail(sourceRef.current);
          setOpen(false);
        }} noValidate>
          <Input ref={inputRef} type="email" aria-label="Email address" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} aria-invalid={Boolean(error)} aria-describedby={error ? "sheet-email-error" : undefined} className="mt-3 h-12 text-base" />
          {error && <p id="sheet-email-error" role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
          <Button type="submit" variant="outline" className="mt-8 h-12 w-full">Continue</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
