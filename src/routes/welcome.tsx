import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lookupCustomerByEmail } from "@/lib/customer.functions";
import { useDiffuserStore } from "@/stores/diffuserStore";
import { useIdentityStore } from "@/stores/identityStore";

export const Route = createFileRoute("/welcome")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Find your orders | Brume" },
      {
        name: "description",
        content:
          "Enter the email you used for your Brume order to unlock a tailored experience, or continue as a guest.",
      },
      { property: "og:title", content: "Find your orders | Brume" },
      { property: "og:description", content: "Match your purchase history with the email you ordered with." },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  const navigate = useNavigate();
  const lookup = useServerFn(lookupCustomerByEmail);
  const setMatched = useIdentityStore((s) => s.setMatched);
  const setGuest = useIdentityStore((s) => s.setGuest);
  const diffusers = useDiffuserStore((s) => s.diffusers);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  function goNext() {
    navigate({ to: diffusers.length > 0 ? "/home" : "/setup", replace: true });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const result = await lookup({ data: { email: email.trim() } });
      if (result.matched) {
        setMatched({ email: email.trim(), firstName: result.firstName, orderCount: result.orderCount });
        toast.success(
          result.firstName ? `Welcome back, ${result.firstName}.` : "We found your purchase history.",
        );
      } else {
        setGuest(email.trim());
        toast.message(
          result.unavailable
            ? "Order lookup is temporarily unavailable. Continuing as a guest."
            : "No orders found for that email. Continuing as a guest.",
        );
      }
      goNext();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function continueAsGuest() {
    setGuest();
    goNext();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-6 py-12">
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex items-center justify-center">
          <BrandLogo className="h-7" />
        </div>

        <div className="border border-border bg-card p-8">
          <h1 className="text-2xl">What email did you order with?</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No account, no password. We only use it to match your purchase history and tailor your
            diffuser experience.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Order email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Checking…" : "Continue"}
            </Button>
          </form>

          <button
            type="button"
            onClick={continueAsGuest}
            className="mt-6 w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Skip and continue as guest
          </button>
        </div>
      </div>
    </main>
  );
}
