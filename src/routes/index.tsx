import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Waves, Bluetooth, Gauge, CalendarClock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import heroImage from "@/assets/diffuser-hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aura — Control Your Smart Scent Diffuser" },
      {
        name: "description",
        content:
          "Pair your Aura diffuser over Bluetooth, pick an intensity and set the hours it runs. Available across the USA.",
      },
      { property: "og:title", content: "Aura — Control Your Smart Scent Diffuser" },
      {
        property: "og:description",
        content: "Pair over Bluetooth, choose your intensity and schedule your scent.",
      },
    ],
  }),
  component: Landing,
});

const steps = [
  { icon: Bluetooth, title: "Pair over Bluetooth", copy: "Find your diffuser and give it a name." },
  { icon: Gauge, title: "Pick an intensity", copy: "Low, medium or high — change it anytime." },
  { icon: CalendarClock, title: "Set your schedule", copy: "Choose the days and hours it runs." },
];

function Landing() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/home", replace: true });
      else setChecking(false);
    });
  }, [navigate]);

  if (checking) return <div className="min-h-screen bg-background" />;

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--gradient-glow)" }}
        aria-hidden
      />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-16 px-6 py-10 lg:py-20">
        <header className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-display text-2xl uppercase tracking-[0.3em]">
            <Waves className="size-5 text-accent" aria-hidden />
            Aura
          </span>
          <Button asChild variant="ghost">
            <Link to="/auth">Sign in</Link>
          </Button>
        </header>

        <section className="grid items-center gap-12 lg:grid-cols-2">
          <div className="space-y-7">
            <p className="eyebrow text-muted-foreground">Now available across the USA</p>
            <h1 className="font-display text-5xl uppercase leading-[1.02] sm:text-7xl">
              Your home,
              <br />
              scented on schedule.
            </h1>
            <p className="max-w-md text-lg text-muted-foreground">
              Connect your Aura smart scent diffuser in under a minute, dial in the intensity and let it
              run exactly when you want it to.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/auth">Get started</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth">I already have an account</Link>
              </Button>

            </div>
          </div>

          <div className="relative">
            <img
              src={heroImage}
              alt="Aura smart scent diffuser releasing a soft mist on a stone surface"
              width={1408}
              height={1008}
              className="w-full rounded-none border border-border object-cover"
              style={{ boxShadow: "var(--shadow-soft)" }}
            />
          </div>
        </section>

        <section className="grid gap-5 sm:grid-cols-3">
          {steps.map(({ icon: Icon, title, copy }, i) => (
            <div key={title} className="rounded-none border border-border bg-card p-6">
              <Icon className="size-5 text-accent" aria-hidden />
              <h2 className="mt-4 font-display text-xl uppercase tracking-wide">
                {i + 1}. {title}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">{copy}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
