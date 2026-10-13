import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { completeShopifySignIn } from "@/lib/shopify-auth";

export const Route = createFileRoute("/auth/shopify-callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Signing in | Brume" },
      { name: "description", content: "Finishing your Shopify sign-in to Brume." },
      { property: "og:title", content: "Signing in | Brume" },
      { property: "og:description", content: "Finishing your Shopify sign-in to Brume." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ShopifyCallback,
});

function ShopifyCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error");
    if (oauthError || !code || !state) {
      setError("The sign-in was cancelled or incomplete. Please try again.");
      return;
    }
    completeShopifySignIn(code, state)
      .then(() => void navigate({ to: "/", replace: true }))
      .catch((err: Error) => setError(err.message));
  }, [navigate]);

  return (
    <div className="fixed inset-0 flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-background">
      <div className="relative mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-11 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div className="z-40 shrink-0 -mx-11 bg-background px-11 pt-[calc(env(safe-area-inset-top)+2rem)] pb-8">
          <AppHeader />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          {error ? (
            <>
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="secondary" onClick={() => void navigate({ to: "/", replace: true })}>
                Go back
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Signing you in…</p>
          )}
        </div>
      </div>
    </div>
  );
}
