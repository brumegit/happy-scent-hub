# Task roadmap

- [ ] Restrict Bird SDK initialization and contact/event calls to installed mobile apps; verify browser blocking and mobile allowance.

- [x] Add deferred Apple tracking permission and Meta reporting gates; timing/authorization tests and browser blocking checks passed.
- [ ] Verify the real Apple prompt and Allow/Refuse on iPhone. BLOCKED on: user pulling changes and running iOS build 16 with the updated web version in a test environment.

- [x] Add optional email as the first setup step, Skip confirmation, and email attribution for support alerts.
- [ ] Native code work (next store release): Bird push notifications (permission request, token to Bird with customer email), Firebase Analytics native SDK integration. BLOCKED on: Apple APNs key (.p8 + Key ID + Team ID) configured in Bird.
- [ ] REMIND USER: Xcode part (iOS device testing / store build) — user said to remind him later (Oct 13, 2026). GoogleService-Info.plist already added; needs the "copy into Xcode project" step when he returns to it.
