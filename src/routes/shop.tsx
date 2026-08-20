import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";
import { CartDrawer } from "@/components/CartDrawer";
import { GuestBanner } from "@/components/GuestBanner";
import { Button } from "@/components/ui/button";
import { fetchProducts, formatPrice, type ShopifyProduct } from "@/lib/shopify";
import { useCartStore } from "@/stores/cartStore";

const STORE_URL = "https://brume.me";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Scent refills | Brume" },
      {
        name: "description",
        content: "Order Brume scent refills in a tap: live availability and prices from the Brume store.",
      },
      { property: "og:title", content: "Scent refills | Brume" },
      {
        property: "og:description",
        content: "Order Brume scent refills in a tap: live availability and prices from the Brume store.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ShopPage,
});

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

function isRefill(product: ShopifyProduct) {
  const haystack = `${product.node.title} ${product.node.productType}`.toLowerCase();
  return !haystack.includes("diffuser");
}

function inStock(product: ShopifyProduct) {
  return product.node.variants.edges.some((v) => v.node.availableForSale);
}

function RefillCard({ product }: { product: ShopifyProduct }) {
  const addItem = useCartStore((s) => s.addItem);
  const isLoading = useCartStore((s) => s.isLoading);
  const node = product.node;
  const variant = node.variants.edges.find((v) => v.node.availableForSale)?.node ?? node.variants.edges[0]?.node;
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
    <article className="flex flex-col">
      {image && (
        <img
          src={image.url}
          alt={image.altText ?? node.title}
          loading="lazy"
          className="w-full object-contain"
        />
      )}
      <div className="px-6">
        <h2 className="mt-3 text-sm normal-case text-black">{node.title}</h2>
        <p className="mt-1 text-sm text-neutral-500">
          {formatPrice(node.priceRange.minVariantPrice.amount, node.priceRange.minVariantPrice.currencyCode)}
        </p>
        <Button
          variant="default"
          className="mt-3 h-14 w-full"
          onClick={handleAddToCart}
          disabled={isLoading || !variant?.availableForSale}
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add to cart"}
        </Button>
      </div>
    </article>
  );
}

function ShopPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: () => fetchProducts(),
  });

  const refills = (data ?? []).filter((p) => isRefill(p) && inStock(p));

  return (
    <div className="relative flex min-h-screen flex-col">
      <GuestBanner />
      <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col">
        <div className="px-6 py-8">
          <AppHeader />
        </div>

        <main className="flex-1 bg-white text-black">
          <div className="px-6 pt-10 pb-24">
            <div className="flex items-center justify-between gap-4">
              <h1 className="font-display text-4xl leading-tight">Scent refills</h1>
              <CartDrawer />
            </div>

            {isLoading && (
              <div className="mt-8 grid grid-cols-2 gap-px -mx-6">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-64 animate-pulse bg-neutral-200" />
                ))}
              </div>
            )}

            {!isLoading && refills.length === 0 && (
              <p className="mt-16 text-center text-sm text-neutral-500">No products found.</p>
            )}

            {!isLoading && refills.length > 0 && (
              <div className="mt-8 grid grid-cols-2 gap-px -mx-6">
                {refills.map((product) => (
                  <RefillCard key={product.node.id} product={product} />
                ))}
              </div>
            )}

            <Button variant="default" className="mt-10 h-14 w-full" onClick={() => void openStore("/")}>
              Open the full store
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
}
