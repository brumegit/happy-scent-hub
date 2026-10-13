import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getContactEmail, saveContactEmail } from "@/lib/customer-identity";
import { identifyHotjar } from "@/lib/hotjar";

export function EmailStep({ onContinue }: { onContinue: () => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [skipOpen, setSkipOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setEmail(getContactEmail() ?? ""); }, []);

  return (
    <section className="flex flex-1 flex-col justify-center">
      <h1 className="font-display text-3xl leading-tight">Tailor your diffuser to you</h1>
      <p className="mt-3 text-sm text-foreground">Use the email from your Brume order so we can tailor your experience.</p>
      <form className="mt-8" onSubmit={(event) => {
        event.preventDefault();
        if (!saveContactEmail(email)) {
          setError("Enter a valid email address.");
          inputRef.current?.focus();
          return;
        }
        identifyHotjar(getContactEmail());
        onContinue();
      }} noValidate>
        <Input ref={inputRef} id="setup-email" type="email" aria-label="Email address" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} aria-invalid={Boolean(error)} aria-describedby={error ? "setup-email-error" : undefined} className="mt-3 h-12 text-base" />
        {error && <p id="setup-email-error" role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        <Button type="submit" variant="outline" className="mt-8 h-12 w-full">Continue</Button>
        <Button type="button" variant="ghost" className="mt-2 h-8 w-full text-sm text-muted-foreground" onClick={() => setSkipOpen(true)}>Skip</Button>
      </form>
      <Dialog open={skipOpen} onOpenChange={setSkipOpen}>
        <DialogContent className="w-[88vw] max-w-md border-border bg-background px-8 py-10" onCloseAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}>
          <DialogHeader>
            <DialogTitle className="font-display text-3xl leading-tight text-gold">Continue without email?</DialogTitle>
            <DialogDescription className="text-sm text-foreground">You can still use your diffuser, but your experience won’t be tailored to you, and you’ll set it up without an order email on file.</DialogDescription>
          </DialogHeader>
          <Button variant="outline" className="mt-4 h-12 w-full" onClick={() => setSkipOpen(false)}>Enter email</Button>
          <Button variant="ghost" className="h-12 w-full" onClick={() => { setSkipOpen(false); onContinue(); }}>Skip for now</Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}