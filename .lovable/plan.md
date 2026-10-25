# Make Bird push notifications actually work (iOS + Android)

## What went wrong
On Oct 13 I promised the push registration code (permission, device token sent to Bird, tied to email). It was never written: the task stayed marked "blocked on the Apple key" even after you supplied that key the same day. Build 1.1 (iOS 16 / Android 15) shipped with only ATT, launch screen and scrolling changes. The notification popup you accepted is a local-notification permission used by Bluetooth, so Bird never received a phone address. That is my miss.

## How Bird push works (from Bird's docs)
Bird only gets a push address through its **native** SDKs (Swift SDK on iPhone, Android SDK with Firebase). The web SDK inside the app cannot register a phone for push. So this needs native code plus one more store build per platform. I will do everything possible here so the Mac part is as short as possible.

## What I build here
1. **Android (fully done here, new signed .aab 1.2 / build 16)**
   - Add Bird Android SDK and its Firebase messaging service (google-services.json is already in place).
   - Bird application key in strings.xml.
   - Small native bridge so the web app can: ask notification permission, identify the Bird contact by email (`emailaddress`), set `subscribedPush: true` when allowed.
2. **iOS (code prepared here)**
   - Bird Swift SDK added via Swift Package Manager in the project.
   - Push Notifications capability (`aps-environment`) entitlement, background remote-notification mode.
   - AppDelegate forwards the APNs token to Bird.
   - Same native bridge as Android (permission, email identify, subscribedPush).
   - Notification Service Extension + App Group / Keychain group if Bird requires them for rich push; I will pre-create what can be scripted and document the rest.
3. **Web app**
   - After setup save and beep confirmation (existing permission moment, never during pairing), ask for push permission through the bridge, then report it to Bird.
   - When an email is entered later, re-identify the native Bird contact so pushes reach that email's contact.
   - Old store builds without the bridge keep working unchanged (feature is skipped silently), so publishing the web app is safe.
4. **Debug check**: the 10-tap debug screen shows push status (permission, token registered yes/no) so you can verify on your phone before submitting.
5. Version notes + IOS_RELEASE.md section "Push build" with the exact Mac clicks.

## What I need from you
- The **Bird application key** for native SDKs (Bird: Developer / Applications / Push Notifications for Brume 24/7). I'll ask for it securely when I start.
- Confirm the Firebase service account JSON and the Apple .p8 are both uploaded in Bird's push settings (iOS tab and Android tab).

## Mac steps afterwards (short)
`git pull`, `npx cap sync ios`, open Xcode, select team, check version 1.2 / build 17, run on your iPhone, check debug screen says "Push registered", then archive and upload.

## Honest limits
- I cannot test a real push from here; the first real proof is your phone showing "Subscribed" in Bird.
- iOS extension targets are fragile to generate without Xcode; if any part fails to open cleanly I will give you the exact 3-click Xcode fix instead of guessing.

## Technical details
- Packages: `com.bird:android-sdk`, Swift package `github.com/messagebird/swift-sdk`.
- New Capacitor plugin `BirdPush` (Swift + Java) registered like `ATTPlugin`, methods: `status`, `requestPermission`, `identify(email)`, `setSubscribed(bool)`.
- Web: `src/lib/bird-push.ts`, gated by `bird-policy` and plugin availability; tests for gating and timing.
- Remove the stale "blocked on APNs key" roadmap item and replace with this work.
