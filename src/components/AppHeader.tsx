import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Waves, LogOut } from "lucide-react";

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
      <Link to="/home" className="flex items-center gap-2 font-display text-xl uppercase tracking-[0.3em]">
        <Waves className="size-5 text-accent" aria-hidden />
        Aura
      </Link>
      <Button variant="ghost" size="sm" onClick={signOut}>
        <LogOut className="size-4" aria-hidden />
        Sign out
      </Button>
    </header>
  );
}
