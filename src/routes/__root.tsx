import type { ErrorComponentProps } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { EmailEntrySheet } from "@/components/EmailEntrySheet";
import { DebugLogSheet } from "@/components/DebugLogSheet";
import { InteractionTracer } from "@/components/InteractionTracer";
import { useCartSync } from "@/hooks/useCartSync";
import { initMetaPixel } from "@/lib/meta";
import { track, identifyKnownUser, initGoogleAnalytics } from "@/lib/analytics";
import { initHotjar, identifyHotjar } from "@/lib/hotjar";
import { getContactEmail } from "@/lib/customer-identity";
import { initTrackingPermission, onTrackingPermissionChange, canTrackAdvertising } from "@/lib/tracking-permission";


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Aura Smart Scent Diffuser" },
      { name: "description", content: "Pair, tune and schedule your Aura smart scent diffuser." },
      { name: "author", content: "Aura" },
      { property: "og:title", content: "Aura Smart Scent Diffuser" },
      { property: "og:description", content: "Pair, tune and schedule your Aura smart scent diffuser." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=Jost:wght@300;400;500;600&display=swap",
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
    ],
    scripts: [
      {
        src: "https://embeddables.p.mbirdcdn.net/sdk/v0/bird-sdk.js",
        "data-config-url":
          "https://api.bird.com/workspaces/69097a3b-f975-4e02-953e-7ed544b6d2b8/applications/2edfaee8-dfab-450a-8f66-033dd4e450b8/signature/2024-06-17T17-12-51_1664b9167f",
        defer: true,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useCartSync();

  useEffect(() => {
    // Query ATT silently at launch. Only the diffuser list requests permission.
    const startPermittedTracking = () => {
      if (!canTrackAdvertising()) return;
      initMetaPixel();
      identifyKnownUser();
      if (!sessionStorage.getItem("meta-authorized-app-open")) {
        sessionStorage.setItem("meta-authorized-app-open", "1");
        import("@/lib/meta").then(({ trackEvent }) => trackEvent("AppOpen", { source: "webview" }, true));
      }
    };
    const unsubscribe = onTrackingPermissionChange(startPermittedTracking);
    void initTrackingPermission().then(startPermittedTracking);
    initHotjar();
    initGoogleAnalytics();
    identifyHotjar(getContactEmail());
    identifyKnownUser();
    // Fire AppOpen once per browser session for retargeting and install attribution.
    if (!sessionStorage.getItem("meta-app-open")) {
      sessionStorage.setItem("meta-app-open", "1");
      track("AppOpen", { meta: { source: "webview" }, bird: { source: "webview" } });
    }
    return unsubscribe;
  }, []);





  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <InteractionTracer />
      <DebugLogSheet />
      <EmailEntrySheet />
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}

