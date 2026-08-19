import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";

import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export function AppHeader() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

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
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="size-4" aria-hidden />
          Sign out
        </Button>
      </div>
    </header>
  );
}
