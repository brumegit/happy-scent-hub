# Task roadmap

- [x] Restrict Bird SDK initialization and contact/event calls to installed mobile apps; browser blocking verified, mobile platform allowance tested with simulated native environments (not physical devices).

- [x] Add deferred Apple tracking permission and Meta reporting gates; timing/authorization tests and browser blocking checks passed.
- [ ] Verify the real Apple prompt and Allow/Refuse on iPhone. BLOCKED on: user pulling changes and running iOS build 16 with the updated web version in a test environment.

- [x] Add optional email as the first setup step, Skip confirmation, and email attribution for support alerts.
- [ ] Bird native push registration (Bird Swift + Android SDKs, BirdPush bridge, permission after setup, email identify, subscribedPush). Missed in build 1.1; needs Bird native application key, then new store builds. APNs key was already provided Oct 13 (not a blocker).
- [ ] Firebase Analytics native SDK integration (next store release).
- [ ] REMIND USER: Xcode part (iOS device testing / store build) — user said to remind him later (Oct 13, 2026). GoogleService-Info.plist already added; needs the "copy into Xcode project" step when he returns to it.
