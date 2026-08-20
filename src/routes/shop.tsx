import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { AppHeader } from "@/components/AppHeader";
import { CartDrawer } from "@/components/CartDrawer";
import { GuestBanner } from "@/components/GuestBanner";
import { ProductCard } from "@/components/ProductCard";
import { fetchProducts } from "@/lib/shopify";

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

function ShopPage() {
  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: () => fetchProducts(),
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
          <CartDrawer />
        </div>

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
      </main>
    </div>
  );
}
