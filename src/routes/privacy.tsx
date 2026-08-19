import { createFileRoute } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy | Brume" },
      {
        name: "description",
        content:
          "How Brume uses your email to match your purchase history, and how your diffuser settings stay on your device.",
      },
      { property: "og:title", content: "Privacy Policy | Brume" },
      {
        property: "og:description",
        content:
          "How Brume uses your email to match your purchase history, and how your diffuser settings stay on your device.",
      },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <main className="min-h-screen px-6 py-12">
      <article className="mx-auto max-w-2xl">
        <div className="mb-8 flex justify-center">
          <BrandLogo className="h-7" />
        </div>
        <h1 className="text-3xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: August 19, 2026</p>

        <div className="prose-custom mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-lg text-foreground">What we collect</h2>
            <p>
              When you enter the email you ordered with, we send it to our server solely to look up your
              Brume purchase history on Shopify. We do not create an account, store a password, or keep
              your email on file beyond the current session on this device.
            </p>
          </section>

          <section>
            <h2 className="text-lg text-foreground">What stays on your device</h2>
            <p>
              Your diffuser name, intensity, and schedule are stored locally on your phone and sent
              directly to your diffuser over Bluetooth. They are never uploaded to our servers.
            </p>
          </section>

          <section>
            <h2 className="text-lg text-foreground">Bluetooth</h2>
            <p>
              The app uses Bluetooth to discover, connect to, and configure your Brume diffuser. We do
              not use Bluetooth to track your location.
            </p>
          </section>

          <section>
            <h2 className="text-lg text-foreground">Third parties</h2>
            <p>
              We use Shopify to verify orders and Supabase for infrastructure. These providers process
              data under their own privacy policies as subprocessors.
            </p>
          </section>

          <section>
            <h2 className="text-lg text-foreground">Your choices</h2>
            <p>
              You can continue as a guest without entering an email. You can clear your local data at
              any time by removing a diffuser from the app.
            </p>
          </section>

          <section>
            <h2 className="text-lg text-foreground">Contact</h2>
            <p>
              Questions about this policy? Email{" "}
              <a className="underline underline-offset-4" href="mailto:support@brume.me">
                support@brume.me
              </a>
              .
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
