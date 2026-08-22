# iOS App Store release — Brume

This runbook covers building and submitting the iOS app. The web app and the
native project are already scaffolded (`ios/`); the app loads the published web
build from a live URL, so the only thing that changes here is versioning,
signing, archiving and uploading — all on a Mac.

## Prerequisites
- A Mac with **Xcode 15+**.
- A paid **Apple Developer Program** membership ($99/year). A free Apple ID is
  enough for personal device testing but NOT for App Store submission.
- The Brume web app must be **published** (the native shell loads it from the
  production URL configured in `capacitor.config.ts`).

## 1. Pull the latest native project
```bash
git pull
bun install
bun run build              # rebuild web assets (informational; live-URL mode)
npx cap sync ios           # ensure plugins + assets are current
```

## 2. Set the version
- In Xcode: select the **App** target → **General**.
- `Version` = marketing version, e.g. `1.0.0`.
- `Build` = increment every upload, e.g. `1`, `2`, `3`…

## 3. Open and sign
```bash
npx cap open ios           # opens App.xcworkspace in Xcode
```
- Target **App** → **Signing & Capabilities**.
- **Team:** your Apple Developer team.
- **Automatically manage signing:** ON. Xcode generates the provisioning
  profile. If it errors, pick a different bundle suffix or reset the account.

## 4. Archive
- Device selector: **Any iOS Device (arm64)** (or your connected iPhone).
- Menu: **Product → Archive**.
- When the Organizer opens, **Distribute App → App Store Connect → Upload**.
- Accept the bitcode/symbols prompts; let it upload.

## 5. App Store Connect
- https://appstoreconnect.apple.com → **My Apps → + → New App**.
  - Platforms: iOS. Name: Brume. Primary language: English.
  - Bundle ID: `me.brume.diffuser` (must match the signed archive).
- Under the new app → **App Store** tab → add listing (see `STORE_LISTINGS.md`):
  - Subtitle, description, keywords, support/marketing URLs, privacy policy URL.
  - Screenshots for 6.9" and 6.5" iPhones.
  - Age rating questionnaire (answers in `STORE_LISTINGS.md`).
- Select the uploaded build in **Build**.
- **Add for Review**, then submit.

## 6. After review
- Apple reviews in ~1–2 days. Fix any rejection notes, bump the Build number,
  re-archive and re-upload.

## Notes
- The app uses the native Bluetooth LE plugin. `NSBluetoothAlwaysUsageDescription`
  is set in `ios/App/App/Info.plist` — do not remove it.
- Live-URL mode: the webview loads the production Brume web app. To update the
  app's content without a new native release, just re-publish the web app.
  A new native release is only needed for native/plugin/config changes.
