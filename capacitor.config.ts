import type { CapacitorConfig } from "@capacitor/cli";

// The native app is a thin shell over the published Brume web app. The webview
// loads the production URL below, so server functions (Shopify order matching)
// and Supabase keep working unchanged, while the native Bluetooth LE plugin
// runs in the webview via the injected Capacitor bridge. The local webDir is a
// minimal splash shown only while the remote app loads.
const PRODUCTION_URL = "https://app.brume.me";

const config: CapacitorConfig = {
  appId: "me.brume.diffuser",
  appName: "Brume",
  webDir: "native-shell",
  server: {
    url: PRODUCTION_URL,
    cleartext: false,
    // Without this list the native shell treats the remote app as an external
    // site and kicks the user out to Safari (black webview + Safari opening
    // app.brume.me on launch). Everything on brume.me stays inside the app.
    allowNavigation: ["app.brume.me", "*.brume.me", "brume.me", "*.lovable.app"],
  },
  ios: {
    contentInset: "never",
    limitsNavigationsToAppBoundDomains: false,
    backgroundColor: "#000000",
    scrollEnabled: false,
  },
  android: {
    backgroundColor: "#000000",
  },
  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: "Searching",
        cancel: "Cancel",
        availableDevices: "Nearby devices",
        noDeviceFound: "No diffuser found",
      },
    },
  },
};

export default config;
