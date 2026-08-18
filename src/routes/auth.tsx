import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Aura Diffuser" },
      { name: "description", content: "Sign in or create your Aura account to control your smart scent diffuser." },
      { property: "og:title", content: "Sign in — Aura Diffuser" },
      { property: "og:description", content: "Sign in to control your Aura smart scent diffuser." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/home", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/home", replace: true });
        else setSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/home", replace: true });
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed. Please try again.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/home", replace: true });
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-6 py-12">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--gradient-glow)" }}
        aria-hidden
      />
      <div className="relative w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center">
          <BrandLogo className="h-7" />
        </Link>

        <div
          className="rounded-none border border-border bg-card p-8"
          style={{ boxShadow: "var(--shadow-soft)" }}
        >
          {sent ? (
            <div className="space-y-3 text-center">
              <h1 className="text-2xl">Check your email</h1>
              <p className="text-sm text-muted-foreground">
                We sent a confirmation link to <span className="text-foreground">{email}</span>. Open it to
                activate your account, then come back and sign in.
              </p>
              <Button variant="outline" className="mt-2" onClick={() => { setSent(false); setMode("signin"); }}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl">{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                An account is required to pair and schedule your diffuser.
              </p>

              <Button variant="outline" className="mt-6 w-full" onClick={handleGoogle}>
                Continue with Google
              </Button>

              <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}
                </Button>
              </form>

              <button
                type="button"
                className="mt-6 w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              >
                {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
