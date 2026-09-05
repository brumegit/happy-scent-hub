import { Link } from "@tanstack/react-router";

import { BrandLogo } from "@/components/BrandLogo";

export function AppHeader() {
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
      </nav>
    </header>
  );
}
