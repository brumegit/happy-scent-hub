import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { AppHeader } from "@/components/AppHeader";
import { CartDrawer } from "@/components/CartDrawer";
import { GuestBanner } from "@/components/GuestBanner";
import { ProductCard } from "@/components/ProductCard";
import { fetchProducts } from "@/lib/shopify";

const STORE_URL = "https://brume.me";

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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ShopPage,
});

function useIsNativeApp() {
  const [isNative, setIsNative] = useState(false);
  useEffect(() => {
    let cancelled = false;
    import("@capacitor/core")
      .then(({ Capacitor }) => {
        if (!cancelled) setIsNative(Capacitor.isNativePlatform());
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return isNative;
}

async function openStore(path = "/") {
  const url = `${STORE_URL}${path}`;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url, presentationStyle: "fullscreen", toolbarColor: "#000000" });
      return;
    }
  } catch {
    // fall through to a normal tab
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function ShopPage() {
  const isNative = useIsNativeApp();

  // In the native app the whole Shopify site (with every custom section
  // you build there) is loaded in an embedded browser, so nothing needs
  // to be re-coded here.
  useEffect(() => {
    if (isNative) void openStore("/");
  }, [isNative]);

  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: () => fetchProducts(),
    enabled: !isNative,
  });

  return (
    <div className="flex min-h-screen flex-col">
      <GuestBanner />
      <div className="mx-auto w-full max-w-5xl px-6 pt-8">
        <AppHeader />
      </div>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 pb-24">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-display text-3xl uppercase tracking-wide">Shop</h1>
          {!isNative && <CartDrawer />}
        </div>

        <button
          type="button"
          onClick={() => void openStore("/")}
          className="mt-6 flex h-14 w-full items-center justify-center border border-border text-xs uppercase tracking-[0.2em] transition-colors hover:bg-foreground hover:text-background"
        >
          Open the full store
        </button>

        {isNative && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Loading the Brume store...
          </p>
        )}

        {!isNative && (
          <>
            {isLoading && (
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-80 animate-pulse border border-border bg-card" />
                ))}
              </div>
            )}

            {!isLoading && (products?.length ?? 0) === 0 && (
              <p className="mt-16 text-center text-sm text-muted-foreground">No products found.</p>
            )}

            {!isLoading && products && products.length > 0 && (
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((product) => (
                  <ProductCard key={product.node.id} product={product} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
