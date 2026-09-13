# Version notes

A new entry is added here every time a new version or build of the BRUME app is
created. Newest first.

Each automatic backup also writes a dated build note to Google Drive under
**App/Lovable/build-notes**, with the commit, the list of changed files and the
version/build numbers.

---

## 1.0.11 — build 12 (Android)

Date: 2026-09-13

- Signed `.aab` rebuilt with the latest native code and synced web assets.
- App name is **Brume 24/7** in the launcher.
- Capacitor config points to `https://app.brume.me` (live-URL mode).
- Bluetooth manifest: `BLUETOOTH_SCAN` uses `neverForLocation`, native-ble
  initializes with `androidNeverForLocation: true`.
- R8 minification + resource shrinking enabled.
- Signed with the existing BRUME upload keystore (same key as all prior
  uploads — Play accepts it as an update).
- Build output: `/mnt/documents/exports/brume-android-release-v1.0.11.aab`
- Deobfuscation mapping: `/mnt/documents/exports/mapping-v1.0.11.txt`

---

## 1.0.10 — build 11 (Android) / 1.0 (iOS)

Date: 2026-09-13

- Google Drive backup extended: all documentation, plans and configuration are
  now copied to the **App/Lovable** folder, alongside Android and iOS.
- Version notes are kept in this file and a dated build note is written to
  Drive on every build.

### Earlier work in this version

- Bluetooth saving rewritten to write all five routine slots authoritatively,
  with no reads, probes or reconnects during or after saving.
- Automatic reconnection when the diffuser link drops before or during a save.
- Debug mode: 10 taps on the logo, floating "Open debug log" / "Exit debug mode"
  controls, full tap-by-tap trace, copy and share.
- "Where's it going" room suggestion pills: two rows drifting in opposite
  directions at 5 px/s.
- Up to five routines, names never contain times.
- Failure messages point to contact@brume.me and can attach the debug log.

---

## How to add a new entry

1. Bump `versionCode` / `versionName` in `android/app/build.gradle` and the
   iOS version in Xcode.
2. Add a new section at the top of this file, above the previous one.
3. Push to `main` — the backup workflow copies this file to Google Drive.
