# Ship Brume to the App Store + Google Play

## Goal
Prepare both native store builds in parallel:
- **Android**: scaffold, build the `.aab` here, document Play Console upload.
- **iOS**: scaffold + permissions + store metadata here, document the Mac build
  + App Store Connect upload (final build must run on a Mac).

## Accounts you must hold
- Apple Developer Program: **$99/year** (required for App Store; free Apple ID
  is NOT enough for distribution).
- Google Play Developer: **$25 one-time**.

## Phase 1 — Native project scaffolding (done here)

1. Add Android + iOS native projects.
   - `npx cap add android` → generates `android/`.
   - `npx cap add ios` → generates `ios/`.
   - Both inherit appId `me.brume.diffuser`, appName `Brume`.

2. Bluetooth permissions (required or the app crashes on BLE).
   - iOS `ios/App/App/Info.plist`:
     - `NSBluetoothAlwaysUsageDescription`
     - `NSBluetoothPeripheralUsageDescription`
   - Android `android/app/src/main/AndroidManifest.xml`:
     - `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT` (Android 12+),
     - legacy `BLUETOOTH`, `BLUTOOTH_ADMIN`, `ACCESS_FINE_LOCATION`.

3. App icons + splash (store-ready).
   - Generate 1024×1024 icon from the existing `src/assets/brume-logo.svg` mark.
   - Run `@capacitor/assets` to populate `android/` and `ios/` icon/splash sets.

4. Build + sync web assets.
   - `bun run build` → `dist/`.
   - `npx cap sync android ios` → copies assets into both native projects.

## Phase 2 — Android build (done here, no Mac)

5. Build the release bundle.
   - Verify JDK + Android SDK are available in the sandbox; install the Android
     command-line tools if missing.
   - `cd android && ./gradlew bundleRelease` → produces
     `android/app/build/outputs/bundle/release/app-release.aab`.
   - The `.aab` is what you upload to Google Play; the store generates per-device
     APKs from it.

6. Sign the bundle.
   - Generate a keystore (or you supply one), wire it into
     `android/app/build.gradle` `signingConfigs`. Document that the keystore +
     passwords must be kept forever (future updates must use the same key).

## Phase 3 — iOS build (documented; runs on a Mac)

7. `IOS_RELEASE.md` runbook with the exact Mac steps:
   - `open ios/App/App.xcworkspace`.
   - Set team to your $99/yr Apple Developer account; enable "Automatically
     manage signing".
   - Increment build/version, Archive, "Distribute App → App Store Connect".
   - App Store Connect: create the app record, upload, fill listing, submit for
     review.

## Phase 4 — Store listings (metadata, done here)

8. Prepare listing copy for both stores in `STORE_LISTINGS.md`:
   - App name, subtitle, promotional text, description, keywords.
   - Category, content rating, age rating answers.
   - **Privacy policy URL** — required by both stores; I'll scaffold a public
     `/privacy` route so you have a real URL to give them.
   - Support URL + marketing URL.
   - Note on screenshots: each store needs device-specific screenshots
     (6.7", 6.5", 5.5" for iOS; phone/tablet for Android). I'll document sizes;
     capturing them is a manual step (or from the built app).

## Rebuild after changes
- Web/UI changes: rebuild + `npx cap sync`, then rebuild the `.aab` here and
  re-archive on Mac.
- Native capability/permission changes: re-sync, pod install on iOS if a new
  native plugin is added.

## Notes / limits
- Android `.aab` buildable on Linux (here). iOS `.ipa`/archive buildable ONLY on
  a Mac — this is Apple's rule, not a tooling gap.
- Keystore for Android must be preserved; losing it means you can never update
  the app on the store.
- Apple review and Google review both apply; allow ~1–2 days each.
