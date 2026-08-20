import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { GuestBanner } from "@/components/GuestBanner";

const STORE_URL = "https://brume.me";

function platformMedium(): string {
  if (typeof window !== "undefined") {
    const ua = window.navigator.userAgent || "";
    if (/android/i.test(ua)) return "Android";
    if (/iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document)) {
      return "iOS";
    }
  }
  // Capacitor native: infer from platform at runtime when available
  return "iOS";
}

async function openStore() {
  let medium = platformMedium();
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const platform = Capacitor.getPlatform();
      medium = platform === "android" ? "Android" : "iOS";
      const url = `${STORE_URL}/?utm_source=App&utm_medium=${medium}&utm_content=Shop`;
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url, presentationStyle: "fullscreen", toolbarColor: "#000000" });
      return;
    }
  } catch {
    // fall through to default browser
  }
  const url = `${STORE_URL}/?utm_source=App&utm_medium=${medium}&utm_content=Shop`;
  window.open(url, "_blank", "noopener,noreferrer");
}

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Shop | Brume" },
      {
        name: "description",
        content: "Browse the full Brume store and order scent refills and diffusers.",
      },
      { property: "og:title", content: "Shop | Brume" },
      {
        property: "og:description",
        content: "Browse the full Brume store and order scent refills and diffusers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ShopPage,
});

function ShopPage() {
  useEffect(() => {
    void openStore();
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col">
      <GuestBanner />
      <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-base text-neutral-400">Opening the Brume store…</p>
          <button
            type="button"
            onClick={() => void openStore()}
            className="mt-6 text-sm underline decoration-dotted underline-offset-4"
          >
            Tap here if it doesn't open
          </button>
        </div>
      </div>
    </div>
  );
}
