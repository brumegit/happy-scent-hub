import { Link } from "@tanstack/react-router";
import { UserRound } from "lucide-react";

import { BrandLogo } from "@/components/BrandLogo";
import { CartDrawer } from "@/components/CartDrawer";
import { Button } from "@/components/ui/button";
import { useIdentityStore } from "@/stores/identityStore";

export function AppHeader() {
  const email = useIdentityStore((s) => s.email);
  const status = useIdentityStore((s) => s.status);

  return (
    <header className="flex items-center justify-between border-b border-border pb-5">
      <Link to="/home" className="flex items-center">
        <BrandLogo className="h-5" />
      </Link>
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/shop">Shop</Link>
        </Button>
        <CartDrawer />
        <Button asChild variant="ghost" size="sm">
          <Link to="/welcome">
            <UserRound className="size-4" aria-hidden />
            <span className="max-w-[10rem] truncate">
              {status === "matched" && email ? email : "Guest"}
            </span>
          </Link>
        </Button>
      </div>
    </header>
  );
}
