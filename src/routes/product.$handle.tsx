import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { BrandLogo } from "@/components/BrandLogo";
import { CartDrawer } from "@/components/CartDrawer";
import { Button } from "@/components/ui/button";
import { fetchProductByHandle, formatPrice } from "@/lib/shopify";
import { useCartStore } from "@/stores/cartStore";

export const Route = createFileRoute("/product/$handle")({
  head: () => ({
    meta: [
      { title: "Product — Brume" },
      { name: "description", content: "Brume scented oil refills and diffusers for your smart scent diffuser." },
      { property: "og:title", content: "Product — Brume" },
      { property: "og:description", content: "Brume scented oil refills and diffusers." },
    ],
  }),
  component: ProductPage,
});

function ProductPage() {
  const { handle } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["product", handle],
    queryFn: () => fetchProductByHandle(handle),
  });
  const addItem = useCartStore((state) => state.addItem);
  const cartLoading = useCartStore((state) => state.isLoading);

  const node = data?.node;
  const variant = node?.variants.edges[0]?.node;
  const image = node?.images.edges[0]?.node;

  async function handleAddToCart() {
    if (!data || !variant) return;
    await addItem({
      product: data,
      variantId: variant.id,
      variantTitle: variant.title,
      price: variant.price,
      quantity: 1,
      selectedOptions: variant.selectedOptions ?? [],
    });
    toast.success(`${node?.title} added to cart`);
  }

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0" style={{ background: "var(--gradient-glow)" }} aria-hidden />
      <div className="relative mx-auto max-w-4xl px-6 py-8">
        <header className="flex items-center justify-between border-b border-border pb-5">
          <Link to="/" className="flex items-center">
            <BrandLogo className="h-5" />
          </Link>
          <CartDrawer />
        </header>

        <Button asChild variant="ghost" size="sm" className="mt-6">
          <Link to="/shop">
            <ArrowLeft className="size-4" aria-hidden />
            Back to shop
          </Link>
        </Button>

        {isLoading && <div className="mt-8 h-96 animate-pulse border border-border bg-card" />}

        {!isLoading && !node && (
          <p className="mt-16 text-center text-muted-foreground">This product is no longer available.</p>
        )}

        {node && (
          <div className="mt-8 grid gap-10 md:grid-cols-2">
            <div className="aspect-square overflow-hidden border border-border bg-secondary/40">
              {image && <img src={image.url} alt={image.altText ?? node.title} className="h-full w-full object-cover" />}
            </div>
            <div>
              <p className="eyebrow text-muted-foreground">{node.productType}</p>
              <h1 className="mt-2 font-display text-3xl uppercase">{node.title}</h1>
              <p className="mt-3 text-lg">
                {variant
                  ? formatPrice(variant.price.amount, variant.price.currencyCode)
                  : formatPrice(
                      node.priceRange.minVariantPrice.amount,
                      node.priceRange.minVariantPrice.currencyCode,
                    )}
              </p>
              <p className="mt-6 text-sm leading-relaxed text-muted-foreground">{node.description}</p>
              <Button
                className="mt-8 w-full"
                size="lg"
                onClick={handleAddToCart}
                disabled={cartLoading || !variant?.availableForSale}
              >
                {cartLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : variant?.availableForSale ? (
                  "Add to cart"
                ) : (
                  "Sold out"
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
