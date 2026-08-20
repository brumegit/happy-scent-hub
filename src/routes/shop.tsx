import { createFileRoute } from "@tanstack/react-router";

import { AppHeader } from "@/components/AppHeader";
import { GuestBanner } from "@/components/GuestBanner";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Shop refills & diffusers | Brume" },
      {
        name: "description",
        content: "Browse and order from the live Brume store: refills and the 24/7 room diffuser.",
      },
      { property: "og:title", content: "Shop refills & diffusers | Brume" },
      {
        property: "og:description",
        content: "Browse and order from the live Brume store: refills and the 24/7 room diffuser.",
      },
    ],
  }),
  component: ShopPage,
});

function ShopPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <GuestBanner />
      <div className="mx-auto w-full max-w-5xl px-6 pt-8">
        <AppHeader />
      </div>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-6 px-6 pb-24 text-center">
        <h1 className="font-display text-3xl uppercase tracking-wide">Shop</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Refills and diffusers are sold on our secure store. It opens in your browser, then you
          come right back here.
        </p>
        <a
          href="https://brume.me"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-14 w-full max-w-sm items-center justify-center border border-border bg-transparent px-6 text-sm uppercase tracking-wide text-foreground transition-colors hover:bg-foreground/10"
        >
          Open the store
        </a>
      </main>
    </div>
  );
}
