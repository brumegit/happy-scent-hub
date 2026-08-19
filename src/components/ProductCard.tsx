import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatPrice, type ShopifyProduct } from "@/lib/shopify";
import { useCartStore } from "@/stores/cartStore";

export function ProductCard({ product }: { product: ShopifyProduct }) {
  const addItem = useCartStore((state) => state.addItem);
  const isLoading = useCartStore((state) => state.isLoading);
  const node = product.node;
  const variant = node.variants.edges[0]?.node;
  const image = node.images.edges[0]?.node;

  async function handleAddToCart() {
    if (!variant) return;
    await addItem({
      product,
      variantId: variant.id,
      variantTitle: variant.title,
      price: variant.price,
      quantity: 1,
      selectedOptions: variant.selectedOptions ?? [],
    });
    toast.success(`${node.title} added to cart`);
  }

  return (
    <article className="flex flex-col border border-border bg-card" style={{ boxShadow: "var(--shadow-soft)" }}>
      <Link to="/product/$handle" params={{ handle: node.handle }} className="block">
        <div className="aspect-square overflow-hidden bg-secondary/40">
          {image && (
            <img
              src={image.url}
              alt={image.altText ?? node.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
            />
          )}
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <p className="eyebrow text-muted-foreground">{node.productType}</p>
        <Link to="/product/$handle" params={{ handle: node.handle }} className="mt-1">
          <h3 className="font-display text-lg uppercase tracking-wide">{node.title}</h3>
        </Link>
        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{node.description}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-sm">
            {formatPrice(node.priceRange.minVariantPrice.amount, node.priceRange.minVariantPrice.currencyCode)}
          </span>
          <Button size="sm" onClick={handleAddToCart} disabled={isLoading || !variant?.availableForSale}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : variant?.availableForSale ? (
              "Add to cart"
            ) : (
              "Sold out"
            )}
          </Button>
        </div>
      </div>
    </article>
  );
}
