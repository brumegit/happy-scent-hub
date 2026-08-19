import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { BrandLogo } from "@/components/BrandLogo";
import { CartDrawer } from "@/components/CartDrawer";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { fetchProducts } from "@/lib/shopify";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Shop refills & diffusers — Brume" },
      {
        name: "description",
        content: "Order Brume scented oil refills and the 24/7 room diffuser, shipped across the USA.",
      },
      { property: "og:title", content: "Shop refills & diffusers — Brume" },
      {
        property: "og:description",
        content: "Order Brume scented oil refills and the 24/7 room diffuser, shipped across the USA.",
      },
    ],
  }),
  component: ShopPage,
});

function ShopPage() {
  const { data, isLoading } = useQuery({ queryKey: ["products"], queryFn: () => fetchProducts() });

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0" style={{ background: "var(--gradient-glow)" }} aria-hidden />
      <div className="relative mx-auto max-w-5xl px-6 py-8">
        <header className="flex items-center justify-between border-b border-border pb-5">
          <Link to="/" className="flex items-center">
            <BrandLogo className="h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/home">My diffusers</Link>
            </Button>
            <CartDrawer />
          </div>
        </header>

        <div className="mt-10">
          <p className="eyebrow text-muted-foreground">Shipped across the USA</p>
          <h1 className="mt-2 font-display text-4xl uppercase">Refills & diffusers</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Keep your scent running. Order 300ml refills and accessories straight from the app.
          </p>
        </div>

        {isLoading ? (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-96 animate-pulse border border-border bg-card" />
            ))}
          </div>
        ) : data && data.length > 0 ? (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((product) => (
              <ProductCard key={product.node.id} product={product} />
            ))}
          </div>
        ) : (
          <p className="mt-16 text-center text-muted-foreground">No products found</p>
        )}
      </div>
    </div>
  );
}
