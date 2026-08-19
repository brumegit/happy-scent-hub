import { Link } from "@tanstack/react-router";

import { BrandLogo } from "@/components/BrandLogo";
import { useIdentityStore } from "@/stores/identityStore";

export function AppHeader() {
  const firstName = useIdentityStore((s) => s.firstName);
  const status = useIdentityStore((s) => s.status);

  const diffusersLabel =
    status === "matched" && firstName ? `${firstName}'s Diffusers` : "My Diffusers";

  return (
    <header className="flex items-center justify-between gap-4 border-b border-border pb-5">
      <Link to="/home" className="flex items-center">
        <BrandLogo className="h-5" />
      </Link>
      <nav className="flex items-center gap-5 text-sm normal-case">
        <Link
          to="/home"
          className="border-b border-transparent pb-1 text-foreground transition-colors"
          activeProps={{ className: "border-gold text-foreground" }}
        >
          {diffusersLabel}
        </Link>
        <Link
          to="/shop"
          className="border-b border-transparent pb-1 text-foreground transition-colors"
          activeProps={{ className: "border-gold text-foreground" }}
        >
          Shop
        </Link>
      </nav>
    </header>
  );
}
