import { useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lookupCustomerByEmail } from "@/lib/customer.functions";
import { useIdentityStore } from "@/stores/identityStore";

/**
 * Associates the app with the customer's Shopify purchase history by email.
 * No account is created — the email is only matched against past orders.
 */
export function EmailMatchDialog({ onClose }: { onClose: () => void }) {
  const setMatched = useIdentityStore((s) => s.setMatched);
  const setGuest = useIdentityStore((s) => s.setGuest);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await lookupCustomerByEmail({ data: { email: email.trim() } });
      if (result && result.found) {
        setMatched({
          email: email.trim(),
          firstName: result.firstName ?? null,
          orderCount: result.orderCount ?? 0,
        });
        onClose();
        return;
      }
      setGuest(email.trim());
      setError("We couldn't find an order with this email.");
    } catch (err) {
      setError((err as Error).message || "Could not check this email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-6">
      <div role="dialog" aria-label="Add your email" className="w-full max-w-sm border border-border bg-background p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-2xl">Add your email</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Use the email from your Brume order to unlock your purchase history.
        </p>
        <div className="mt-5 space-y-2">
          <Label htmlFor="match-email">Email</Label>
          <Input
            id="match-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            placeholder="you@example.com"
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <Button className="mt-6 w-full" disabled={busy || !email.trim()} onClick={() => void submit()}>
          {busy ? "Checking" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
