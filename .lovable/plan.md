# Test the Brume app on a physical iPhone

## Goal
Get the Brume diffuser app running natively on your physical iPhone so the real
Bluetooth hardware flow can be tested — not just the simulated web flow.

## Hard constraint (read first)
Compiling and installing a native iOS app requires a **Mac with Xcode**. This
cloud sandbox cannot produce an installable iOS app, and you cannot build it on
the iPhone or on Windows. With a **free Apple ID**, the iPhone must be connected
to that Mac (USB cable, or same Wi‑Fi using Xcode wireless debugging) for the
first install, and you must "trust" your developer profile on the phone.

You only need a Mac for the build/install step. Everything else is done here and
handed to you ready to open.

## What I will do from here (no Mac needed)

1. Scaffold the native iOS project.
   - Run `npx cap add ios` to generate the `ios/` Xcode project from
     `capacitor.config.ts` (appId `me.brume.app`, appName `Brume`).
   - This creates `ios/App/App.xcworkspace`, `Info.plist`, entitlements, etc.

2. Add the Bluetooth permission strings iOS requires.
   - Edit `ios/App/App/Info.plist` to add:
     - `NSBluetoothAlwaysUsageDescription` = "Brume uses Bluetooth to connect
       to and configure your diffuser."
     - `NSBluetoothPeripheralUsageDescription` (legacy, for older iOS).
   - Without these keys, the app crashes the moment the BLE plugin runs.

3. Build the web assets and sync them into the native project.
   - `bun run build` (produces `dist/`).
   - `npx cap sync ios` (copies `dist/` into the iOS project, updates native
     plugin pods).

4. Write a short `IOS_TEST.md` runbook at the repo root with the exact Mac-side
   steps (below), so you can follow them on any Mac without thinking.

## What you do on a Mac (documented in IOS_TEST.md)

5. Open the project on a Mac with Xcode 15+.
   - `open ios/App/App.xcworkspace` (use the workspace, not the .xcodeproj).
   - Or run `npx cap open ios`.

6. Set up signing with your free Apple ID.
   - Select the "App" target → Signing & Capabilities.
   - Team: your Apple ID (add it under Xcode → Settings → Accounts if needed).
   - Let Xcode generate a provisioning profile. Ignore the 7‑day expiry warning
     (free profiles must be re-signed weekly).

7. Connect your iPhone and Run.
   - Plug the iPhone into the Mac (or pair via Window → Devices → enable
     "Connect via network" for wireless).
   - Select the iPhone as the run destination, press ⌘R.
   - On the iPhone: Settings → General → VPN & Device Management → trust your
     developer profile. The app will then launch.

8. Test the real Bluetooth flow.
   - Put your diffuser in pairing mode, walk through onboarding — it will use
     the native Capacitor BLE transport (auto‑selects devices named "BRUME"),
     not the web fallback.

## Rebuilding after changes
- Code/UI changes I make here: I rebuild (`bun run build`) and re-sync
  (`npx cap sync ios`); you pull on the Mac and ⌘R again.
- Native config changes (permissions, capabilities): re-sync is required; a
  pod install may be needed if a new native plugin is added.

## Notes / limits
- Free Apple ID: app runs for up to 7 days, then needs a rebuild. Not for
  distribution — only your own device.
- Real BLE testing is the whole point of the native path; on web/iOS Safari
  there is no Web Bluetooth, so only the simulated flow works there.
