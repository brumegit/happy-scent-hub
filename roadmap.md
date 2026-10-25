# Task roadmap

- [x] Restrict Bird SDK initialization and contact/event calls to installed mobile apps; browser blocking verified, mobile platform allowance tested with simulated native environments (not physical devices).

- [x] Add deferred Apple tracking permission and Meta reporting gates; timing/authorization tests and browser blocking checks passed.
- [ ] Verify the real Apple prompt and Allow/Refuse on iPhone. BLOCKED on: user pulling changes and running iOS build 16 with the updated web version in a test environment.

- [x] Add optional email as the first setup step, Skip confirmation, and email attribution for support alerts.
- [x] Bird native push code: BirdKit + Bird Android SDK, BirdPush plugin, install-id contact link, subscribedPush, debug status. Android release compiles.
- [ ] Put the Bird application key into iOS Info.plist and Android strings.xml, build signed Android 1.2 (16). BLOCKED on: user sending the Bird application key.
- [ ] iOS 1.2 (17) archive on Mac + confirm "Push registered with Bird" on iPhone and a test push. BLOCKED on: user running the Mac steps.
- [ ] Firebase Analytics native SDK integration (next store release).
- [ ] REMIND USER: Xcode part (iOS device testing / store build) — user said to remind him later (Oct 13, 2026). GoogleService-Info.plist already added; needs the "copy into Xcode project" step when he returns to it.
