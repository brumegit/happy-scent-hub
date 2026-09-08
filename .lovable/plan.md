# Test Brume on your iPhone — next steps in Xcode

Xcode is open and sees your iPhone ("iPhone de Florian"), but the toolbar
shows **"iOS 26.5 is not installed."** That means Xcode has the app and the
project, but it doesn't yet have the support files needed to push a build
onto a phone running iOS 26.5. Fix that first, then sign, then run.

## 1. Install the iOS 26.5 support (the blocker)

In the Xcode toolbar, the device dropdown shows "iPhone de Florian (iOS
26.5 is not installed.)" with a blue **Get** button next to it.
- Click **Get**. Xcode downloads the iOS 26.5 device support files
  (sometimes called the "runtime" / Developer Disk Image). Wait for it to
  finish — it's a few hundred MB.
- If **Get** does not appear or fails: update Xcode to the latest version
  from the Mac App Store (Xcode → Settings → Components, or just update the
  app). A current Xcode always ships support for current iOS versions.
- Once done, the dropdown text changes to just "iPhone de Florian" with no
  "not installed" warning.

## 2. Open the signing screen

- In the left sidebar (Project Navigator), click the top item **App**
  (the blue project icon).
- In the center, make sure the **App** target is selected (not the Project).
- Click the **Signing & Capabilities** tab at the top of the center area.

## 3. Sign with your Apple Developer account

- **Automatically manage signing**: turn this ON (checkbox).
- **Team**: pick your approved Apple Developer account from the dropdown.
- Xcode then shows a green checkmark and fills in a "Provisioning Profile"
  automatically. If it shows a red error, tell me the exact text — the most
  common fix is picking a different Team or changing the Bundle Identifier
  suffix (but ours, `me.brume.diffuser`, is already set).

## 4. Plug in the iPhone (if not already)

- Connect your iPhone to the Mac with its charging cable.
- On the iPhone, tap **Trust this computer** if prompted, and enter your
  iPhone passcode.
- In Xcode's device dropdown, confirm it shows **iPhone de Florian**
  (no "not installed" text).

## 5. Run it on the iPhone

- Click the **Play button** (triangle, top-left of Xcode), or press
  **Cmd + R**.
- Xcode builds the app, then installs and launches it on your iPhone. The
  first build takes 1–3 minutes.
- The Brume app opens on your phone. The Bluetooth part now works for real
  — you can pair your actual diffuser here.

## 6. If the iPhone blocks it ("Untrusted Developer")

- On the iPhone: **Settings → General → VPN & Device Management**.
- Tap your developer name → **Trust**.
- Then tap the Brume icon to open it.

## Notes
- This free-device test does **not** go through App Store review and is not
  public. The app stays on your phone; with a paid developer account you
  won't hit the 7-day re-sign limit.
- No code change is needed for this step — the project, bundle ID, and
  Bluetooth permission are already set.
