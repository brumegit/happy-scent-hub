# iOS App Store release — Brume

A plain-language, step-by-step guide to putting Brume on the App Store.
The web app is already published at **https://app.brume.me**, and the native
iOS shell loads it from that URL. So the only things you do on the Mac are:
pull the project, set the version, sign it, archive it, upload it, and fill
in the store listing.

You need:
- A Mac (any recent one). You cannot build the iPhone app on Windows or Linux —
  this is Apple's rule, not a choice.
- **Xcode** installed (free, from the Mac App Store). Open it once after
  installing so it finishes its setup.
- Your **approved Apple Developer account** ($99/year). You already have this.

---

## Step 1 — Get the project onto your Mac

1. Open the **Terminal** app (Applications → Utilities → Terminal).
2. Install Bun (only once):
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```
   Close and reopen Terminal after it finishes.
3. Clone the project:
   ```bash
   cd ~/Documents
   git clone https://github.com/brumegit/happy-scent-hub.git Brume
   cd Brume
   ```
   If it asks for a password, use a GitHub Personal Access Token (with the
   `repo` box checked) as the password — not your GitHub login password.
4. Install the app's dependencies and build the web assets:
   ```bash
   bun install
   bun run build
   ```
5. Sync the web assets into the iOS project:
   ```bash
   npx cap sync ios
   ```

This copies the latest web build into the iOS shell. You only redo this when
the web app changes.

---

## Step 2 — Open the project in Xcode

```bash
npx cap open ios
```

Xcode opens the **App.xcworkspace** file. Always open this workspace, never a
single `.xcodeproj` file.

If Xcode says it needs to download something (a iOS version, or "resolving
packages"), let it finish before continuing.

---

## Step 3 — Set the version

1. In the left sidebar, click the top item **App** (the blue project icon).
2. In the center, make sure the **App** target is selected (not "Project").
3. Click the **General** tab at the top.
4. Set:
   - **Version** = `1.0.0` (the version users see, like "1.0.0").
   - **Build** = `1` (increment this number — 1, 2, 3… — every time you upload
     a new build, even for the same version).

For your first submission use Version `1.0.0`, Build `1`. If Apple rejects it
and you fix something and re-upload, keep Version `1.0.0` but set Build to `2`.

---

## Step 4 — Sign the app with your Apple Developer account

1. Still on the **App** target, click the **Signing & Capabilities** tab.
2. Turn **Automatically manage signing** ON (checkbox).
3. **Team:** pick your approved Apple Developer account from the dropdown.
   - If your account isn't listed: click **Add Account…**, sign in with your
     Apple ID, then pick it.
4. Xcode shows a green checkmark and fills in a "Provisioning Profile"
   automatically. Bundle ID is already set to `me.brume.diffuser` — don't
   change it.

If it shows a red error, tell me the exact text. The usual fixes are picking
a different Team or letting Xcode reset the account.

---

## Step 5 — Archive the app (this builds the upload)

1. At the top of Xcode, the device selector (next to the app name) — set it to
   **Any iOS Device (arm64)**. If your iPhone is plugged in, you can pick it
   instead; either works for archiving.
2. Menu bar: **Product → Archive**. Xcode builds — this takes 1–3 minutes.
3. When it finishes, the **Organizer** window opens showing your new archive.

If the Organizer doesn't open automatically: menu bar **Window → Organizer**.

---

## Step 6 — Upload to App Store Connect

1. In the Organizer, with your latest archive selected, click
   **Distribute App**.
2. Choose **App Store Connect → Upload**.
3. Keep the default options (include bitcode/symbols if asked), click
   **Upload**.
4. Wait for the upload to finish (a progress bar, then "Successfully uploaded").
5. Close the Organizer. Xcode is done — the rest happens in your browser.

---

## Step 7 — Create the app record in App Store Connect

1. Go to https://appstoreconnect.apple.com and sign in with your Apple ID.
2. Click **My Apps → + → New App**.
   - Platforms: **iOS**.
   - Name: **Brume**.
   - Primary language: **English**.
   - Bundle ID: **me.brume.diffuser** (must match what you signed).
   - SKU: anything unique, e.g. `brume-diffuser`.
3. Click **Create**.

You only create this record once. For future uploads, you go back to the same
app and add a new build.

---

## Step 8 — Fill in the store listing

Under your app → **App Store** tab → scroll to the sections below. All the
text is in `STORE_LISTINGS.md`; copy/paste from there.

- **Subtitle:** "Control your scent diffuser"
- **Promotional text:** (from STORE_LISTINGS.md)
- **Description:** (from STORE_LISTINGS.md)
- **Keywords:** (from STORE_LISTINGS.md)
- **Support URL:** https://brume.me
- **Marketing URL:** https://brume.me
- **Privacy Policy URL:** https://app.brume.me/privacy
- **Screenshots:** iPhone 6.9" (1290×2796) and 6.5" (1242×2688).
  Capture these from the running app on your iPhone (see Step 10 below).
- **Age rating:** answer the questionnaire (all "None"/"No" — see
  STORE_LISTINGS.md).

---

## Step 9 — Select the build and submit for review

1. Still in the **App Store** tab, scroll to the **Build** section.
2. It can take 10–30 minutes for Apple to process your uploaded build. When it
   shows up, click it and select the build you uploaded.
3. Click **Add for Review** at the top right.
4. Click **Submit for Review**.

Apple reviews in about 1–2 days. You'll get an email when it's approved or if
they ask for changes.

---

## Step 10 — Capture screenshots (for the listing)

App Store requires screenshots at specific sizes. The easiest way:

1. Run the app on your iPhone (see the test steps below), or use the Xcode
   simulator for a 6.9" iPhone.
2. Take screenshots of the key screens: the setup/intro, pairing, intensity
   stars, the schedule, and the "My Diffuser" home.
3. If they're the wrong size, resize them to 1290×2796 (6.9") and
   1242×2688 (6.5") before uploading.

---

## Testing on your iPhone first (recommended before submitting)

You don't need to submit to the store to test — you can run it directly:

1. Plug your iPhone into the Mac with its cable.
2. On the iPhone: tap **Trust this computer** if asked, enter your passcode.
3. In Xcode's device selector, pick your iPhone.
4. Click the **Play button** (triangle, top-left) or press **Cmd + R**.
5. Xcode builds, installs, and launches Brume on your phone.
6. If the phone says "Untrusted Developer": iPhone **Settings → General →
   VPN & Device Management** → tap your developer name → **Trust**.

---

## After a web-app change (update content without a new native build)

Because the native shell loads the live web app from `app.brume.me`, most
changes (copy, styling, Bluetooth logic, schedules) appear after you
**republish the web app in Lovable** — no new App Store build needed. Open the
app and it loads the new version.

## After a native change (new build required)

Only when something in the native shell changes (a Capacitor plugin, a
permission, the app icon, the production URL) do you need a new App Store
build. Then: bump the **Build** number, re-archive, re-upload, and select the
new build in App Store Connect.

## Notes
- The app uses the native Bluetooth LE plugin. `NSBluetoothAlwaysUsageDescription`
  is set in `ios/App/App/Info.plist` — do not remove it.
- Production URL is `https://app.brume.me`. To change it, edit
  `capacitor.config.ts`; a native rebuild is then required.
- Apple review: ~1–2 days after submission. Fix any rejection notes, bump
  the Build number, re-archive and re-upload.
