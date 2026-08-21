import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppHeader } from "@/components/AppHeader";
import { GuestBanner } from "@/components/GuestBanner";
import {
  SHOPIFY_STOREFRONT_TOKEN,
  SHOPIFY_STOREFRONT_URL,
} from "@/lib/shopify";

const POLICY_QUERY = `
  query PrivacyPolicy {
    shop {
      privacyPolicy { title body }
    }
  }
`;

const FALLBACK_URL = "https://brume.me/policies/privacy-policy";

/** Keep only the tags Shopify's policy editor emits, strip anything else. */
function sanitize(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/ on[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/ on[a-z]+\s*=\s*'[^']*'/gi, "");
}

export const Route = createFileRoute("/privacy")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Privacy policy | Brume" },
      {
        name: "description",
        content:
          "How Brume collects, uses and protects your personal information in the Brume diffuser app.",
      },
      { property: "og:title", content: "Privacy policy | Brume" },
      {
        property: "og:description",
        content: "How Brume handles your data in the diffuser app and on brume.me.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const [body, setBody] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(SHOPIFY_STOREFRONT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Storefront-Access-Token": SHOPIFY_STOREFRONT_TOKEN,
          },
          body: JSON.stringify({ query: POLICY_QUERY }),
        });
        const json = await res.json();
        const html: string | undefined = json?.data?.shop?.privacyPolicy?.body;
        if (cancelled) return;
        if (html) setBody(sanitize(html));
        else setFailed(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative min-h-screen flex flex-col">
      <GuestBanner />
      <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">
        <AppHeader />

        <h1 className="mt-10 font-display text-4xl">Privacy policy</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Pulled live from brume.me, so it always matches the published policy.
        </p>

        {!body && !failed && (
          <div className="mt-8 space-y-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-4 animate-pulse bg-muted" />
            ))}
          </div>
        )}

        {failed && (
          <p className="mt-8 text-sm text-muted-foreground">
            The policy could not be loaded right now.{" "}
            <a
              href={FALLBACK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              Read it on brume.me
            </a>
            .
          </p>
        )}

        {body && (
          <article
            className="policy-body mt-8 pb-16 text-sm leading-relaxed text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: body }}
          />
        )}
      </div>
    </div>
  );
}
