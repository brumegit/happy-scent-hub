import type { CapacitorConfig } from "@capacitor/cli";

// The native app is a thin shell over the published Brume web app. The webview
// loads the production URL below, so server functions (Shopify order matching)
// and Supabase keep working unchanged, while the native Bluetooth LE plugin
// runs in the webview via the injected Capacitor bridge. The local webDir is a
// minimal splash shown only while the remote app loads.
const PRODUCTION_URL =
  "https://project--b7e968af-080d-4dcf-b627-250d2e4b52ef.lovable.app";

const config: CapacitorConfig = {
  appId: "me.brume.diffuser",
  appName: "Brume",
  webDir: "native-shell",
  server: {
    url: PRODUCTION_URL,
    cleartext: false,
  },
  ios: {
    contentInset: "always",
  },
  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: "Looking for your diffuser…",
        cancel: "Cancel",
        availableDevices: "Nearby devices",
        noDeviceFound: "No diffuser found",
      },
    },
  },
};

export default config;
