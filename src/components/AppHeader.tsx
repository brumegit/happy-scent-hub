import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { useHydrated } from "@/hooks/useHydrated";
import { getShopifySession, signOutShopify } from "@/lib/shopify-auth";

export function AppHeader() {
  const hydrated = useHydrated();
  const [session, setSession] = useState(() => (hydrated ? getShopifySession() : null));

  const displayName = session
    ? [session.firstName, session.lastName].filter(Boolean).join(" ") || session.email
    : null;

  return (
    <header className="flex items-center justify-between gap-4 pb-5">
      <Link to="/" className="flex items-center">
        <BrandLogo className="h-5" />
      </Link>
      <nav className="flex items-center gap-5 text-sm normal-case">
        <Link to="/" className="text-foreground hover:underline underline-offset-4">
          My Diffusers
        </Link>
        <Link to="/shop" className="text-foreground hover:underline underline-offset-4">
          Shop
        </Link>
        {hydrated && session && (
            <button
              type="button"
              className="text-gold hover:underline underline-offset-4"
              title="Sign out"
              onClick={() => {
                signOutShopify();
                setSession(null);
              }}
            >
              {displayName}
            </button>
          )}
      </nav>
    </header>
  );
}
