import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CartDrawer } from "@/components/CartDrawer";
import { Button } from "@/components/ui/button";
import { fetchProductByHandle, formatPrice } from "@/lib/shopify";
import { useCartStore } from "@/stores/cartStore";

export const Route = createFileRoute("/product/$handle")({
  head: () => ({
    meta: [
      { title: "Product | Brume" },
      { name: "description", content: "Brume scented oil refills for your smart scent diffuser." },
      { property: "og:title", content: "Product | Brume" },
      { property: "og:description", content: "Brume scented oil refills for your smart scent diffuser." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProductPage,
});

function ProductPage() {
  const { handle } = Route.useParams();
  const [quantity, setQuantity] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["product", handle],
    queryFn: () => fetchProductByHandle(handle),
  });
  const addItem = useCartStore((state) => state.addItem);
  const cartLoading = useCartStore((state) => state.isLoading);

  const node = data?.node;
  const variant = node?.variants.edges.find((v) => v.node.availableForSale)?.node ?? node?.variants.edges[0]?.node;
  const image = node?.images.edges[0]?.node;

  async function handleAddToCart() {
    if (!data || !variant) return;
    await addItem({
      product: data,
      variantId: variant.id,
      variantTitle: variant.title,
      price: variant.price,
      quantity,
      selectedOptions: variant.selectedOptions ?? [],
    });
    toast.success(`${node?.title} added to cart`);
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col">
        <main className="flex-1 bg-white text-black">
          <div className="flex items-center justify-between px-6 pt-8">
            <Button asChild variant="ghost" size="sm" className="-ml-2 text-black hover:text-neutral-500">
              <Link to="/shop">
                <ArrowLeft className="size-4" aria-hidden />
                Back
              </Link>
            </Button>
            <CartDrawer />
          </div>

          {isLoading && <div className="mt-6 aspect-square w-full animate-pulse bg-neutral-200" />}

          {!isLoading && !node && (
            <p className="mt-16 text-center text-sm text-neutral-500">This product is no longer available.</p>
          )}

          {node && (
            <div className="pb-24">
              {image && (
                <img src={image.url} alt={image.altText ?? node.title} className="mt-4 w-full object-contain" />
              )}
              <div className="px-6">
                <h1 className="mt-6 font-display text-3xl leading-tight">{node.title}</h1>
                <p className="mt-2 text-base">
                  {variant
                    ? formatPrice(variant.price.amount, variant.price.currencyCode)
                    : formatPrice(
                        node.priceRange.minVariantPrice.amount,
                        node.priceRange.minVariantPrice.currencyCode,
                      )}
                </p>
                <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-neutral-600">{node.description}</p>

                <div className="mt-8 flex items-center justify-between border border-neutral-200">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    className="flex h-14 w-14 items-center justify-center text-black disabled:opacity-30"
                    disabled={quantity <= 1}
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="text-base">{quantity}</span>
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    className="flex h-14 w-14 items-center justify-center text-black"
                    onClick={() => setQuantity((q) => q + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <Button
                  variant="default"
                  className="mt-3 h-14 w-full"
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
        </main>
      </div>
    </div>
  );
}

