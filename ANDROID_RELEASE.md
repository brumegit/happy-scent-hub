# Google Play release — Brume

The Android app builds on **any** OS (Linux, macOS, Windows) — no Mac needed.
A signed `.aab` was already built in this project; see **Rebuild locally** below
to produce your own.

## What's already done
- Native Android project scaffolded (`android/`), Capacitor 7 + BLE plugin.
- `AndroidManifest.xml` declares `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, and
  legacy `BLUETOOTH`/`ACCESS_FINE_LOCATION` (capped at SDK 30).
- `android/app/src/main/res/...` has the Brume icon and splash at all densities.
- The app loads the published Brume web app from the production URL
  (`capacitor.config.ts`). Keep the web app published or the native app shows
  only the splash.

## Build the .aab yourself
Requirements: **JDK 21** and the **Android SDK** (platform 36 + build-tools 35).

```bash
# 1. Web build (informational in live-URL mode, but keeps assets current)
bun install && bun run build
npx cap sync android

# 2. Point Gradle at your Android SDK
echo "sdk.dir=$HOME/Android/Sdk" > android/local.properties

# 3. Build the release bundle
cd android && ./gradlew bundleRelease
#  → android/app/build/outputs/bundle/release/app-release.aab
```

> The `.aab` is **unsigned**. Google Play signs it for you via
> **App Signing by Google Play** — you upload the unsigned `.aab` and Play
> generates the final APKs. No manual signing key is required for your first
> upload. (If you'd rather sign locally, add a `signingConfigs` block to
> `android/app/build.gradle` with your upload keystore.)

A ready `.aab` from this build is at:
`/mnt/documents/exports/brume-android-release.aab`

## Upload to Google Play
1. https://play.google.com/console → **Create app**.
   - App name: Brume. Default language: English. App: Paid or Free.
   - **App signing key**: choose **Let Google manage and sign your key**
     (recommended — this accepts an unsigned `.aab`).
2. **Dashboard → Set up your app** → fill in store listing (see
   `STORE_LISTINGS.md`): short/full description, icon (512×512), phone
   screenshots, privacy policy URL.
3. **App content** → privacy policy URL, data safety (declare Bluetooth; no
   personal data stored on our servers), content rating (Everyone), target
   audience, ads (no).
4. **Production → Create release** → upload `app-release.aab` → add release
   notes → **Review release** → **Start rollout to Production**.

## Internal testing (fast feedback on a real device)
- Play Console → **Testing → Internal testing → Create release** → upload the
  same `.aab`. Share the opt-in URL with testers; they install from Play.

## Updating the app
- **Content/UI changes:** just re-publish the web app in Lovable — the native
  app reloads it on next launch. No new `.aab` needed.
- **Native/plugin/config changes (permissions, plugin versions, app ID):**
  bump `versionCode` in `android/variables.gradle` / `build.gradle`, rebuild
  the `.aab`, and upload a new Play release.
