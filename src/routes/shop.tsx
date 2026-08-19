import { createFileRoute } from "@tanstack/react-router";

import { AppHeader } from "@/components/AppHeader";
import { GuestBanner } from "@/components/GuestBanner";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Shop refills & diffusers — Brume" },
      {
        name: "description",
        content: "Browse and order from the live Brume store — refills and the 24/7 room diffuser.",
      },
      { property: "og:title", content: "Shop refills & diffusers — Brume" },
      {
        property: "og:description",
        content: "Browse and order from the live Brume store — refills and the 24/7 room diffuser.",
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
      <iframe
        src="https://brume.me"
        title="Brume store"
        className="mt-4 w-full flex-1 border-0 bg-white"
        style={{ minHeight: "calc(100vh - 8rem)" }}
      />
    </div>
  );
}
