# Brume BLE debugging guide

Practical checklist for when the diffuser connects but settings do not reach it,
or the link drops. Written from the regressions we actually hit.

## 0. Know which layer changed

- **Web/JS changes** (anything in `src/`) reach the installed iPhone/Android app
  only after the web app is **published**. The native shell loads
  `https://app.brume.me` (see `capacitor.config.ts`). Rebuilding the app in
  Xcode does *not* ship JS changes.
- **Native changes** (permissions, plugins, `capacitor.config.ts`, icons) require
  `git pull` → `bun install` → `npx cap sync ios` (or `android`) → reinstall.

Symptom "I uploaded a new build and nothing changed" is almost always this.

## 1. Turn on in-app debug

Tap the Brume logo **10 times**. This sets `brume-debug` in local storage and
shows:

- `PushDebugStrip` — every frame sent, per step (modes, intensity, schedule).
- `ReadDebugStrip` — what the diffuser answered.

These strips are the fastest way to see whether the failure is *before* the
write (no channel, no link) or *after* it (no response).

## 2. The three failure classes

| Symptom | Likely cause | Where to look |
| --- | --- | --- |
| Empty device list / endless scan | Android needs location ON + Nearby-devices permission; unnamed devices are filtered out | `src/hooks/useBluetoothRequirements.ts`, `src/lib/native-ble.ts` |
| `113 GATT error` / connect fails | Device not in pairing mode (needs a double tap), or too-fast reconnect after a previous session | retry/backoff in `src/lib/bluetooth.ts` |
| Connects, then "did not confirm" / drops | Wrong GATT characteristic chosen, or a write that restarts the radio | `src/lib/native-ble.ts` channel selection |

## 3. Rules learned the hard way — do not undo these

1. **Never write a device name to the hardware.** Renaming restarts BLE
   advertising and kills the live link mid-session. Names live in the app only.
2. **Do not "improve" the write path with acknowledged writes / readbacks.**
   Switching iOS to acknowledged writes made the diffuser disconnect right after
   the push. The working transport is the one restored from commit
   `b12dbe23d17e1eb64781510290205d49af59f992` (`native-ble.ts`, `bluetooth.ts`,
   `push.ts`). If you touch these three files, test a **fresh onboarding** on a
   real iPhone, not just "Edit settings".
3. **Test both entry paths.** Onboarding and "Edit settings" reach the same push
   code through different states; a bug can show in only one of them.
4. **Never pick "the first writable characteristic".** DFU/OTA channels are
   writable too, and writing settings there reboots the device.

## 4. Reproducing quickly

- Chrome (desktop, Web Bluetooth) reproduces most protocol issues and is much
  faster than an Xcode round trip. iOS-only issues are transport-level.
- Order that must hold on a push: clock sync → working modes → intensity timings
  → schedule. The diffuser beeps **once** on a successful settings push.

## 5. Before saying it is fixed

- Debug strip shows every frame plus a device response.
- One beep, and the link is still up afterwards.
- Fresh onboarding *and* Edit settings both work on a physical device.
