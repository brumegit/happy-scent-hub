import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "me.brume.app",
  appName: "Brume",
  webDir: "dist",
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
