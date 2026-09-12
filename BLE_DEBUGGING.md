# Brume BLE debugging guide

Practical checklist for when the diffuser connects but settings do not reach it,
or the link drops. Written from the regressions we actually hit.

For the binding rules of the working version (what the code must always do and
never do), see **`BLE_REFERENCE.md`** — this guide only covers diagnosis.

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
shows floating **Open debug log** and **Exit debug mode** controls below the
header. The log sheet can be scrolled, copied, or shared.

## 2. The three failure classes

| Symptom | Likely cause | Where to look |
| --- | --- | --- |
| Empty device list / endless scan | Android needs location ON + Nearby-devices permission; unnamed devices are filtered out | `src/hooks/useBluetoothRequirements.ts`, `src/lib/native-ble.ts` |
| `113 GATT error` / connect fails | Device not in pairing mode (needs a double tap), or another app/phone owns the link | connection trace in the debug log |
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
4. **Never switch to a different service because it is writable.** The native
   path preserves the proven serial channel and subscribes only to notifications
   in that service; unrelated OTA/status notifications must not trigger writes.
5. **Never auto-disconnect, auto-reconnect, or replay.** Polling is observational.
   A failed write stops immediately with pairing guidance. The app must never
   call the BLE disconnect API during pairing, editing, saving, or polling.
6. **Every save writes all 5 slots.** Each save sends five `0x14` commands
   (700 ms apart): the user's routines enabled, the remaining slots disabled.
   This makes the save authoritative even when `0x08` cannot be read (iPhone) or
   another phone changed the diffuser. Disabled slots must carry a valid payload
   (weekday mask `0x7F`, start 0, end 1, current spray timing) — zeroed fields
   are rejected by some firmware revisions and can drop the link.
7. **Do not read before or after saving.** Saving sends only the five serialized
   `0x14` writes, 700 ms apart. There is no `0x08` read, final liveness probe, or
   other Bluetooth traffic after the fifth slot.
8. **Do not wait for `0x94` replies on iPhone.** The native transport uses
   CoreBluetooth write-without-response, and this diffuser firmware does not
   notify a reply to each `0x14`. Waiting four seconds after every accepted
   write stretches a five-slot save beyond the peripheral's connection window.
   Native saves continue as soon as the write completes, retaining only the
   700 ms firmware-settle pause between slots. Chrome keeps its response-aware
   path because Web Bluetooth hardware can expose acknowledgments differently.
9. **Apply only one delay between native routine writes.** `pushSettings` owns
   the 700 ms slot-to-slot pause; the transport must not add another 200 ms.
   There is no pause after slot 5. This keeps all five authoritative writes
   inside the diffuser's roughly four-second command window.
10. **Never reconnect or replay in the middle of a save.** If iOS refuses a
    slot write, stop and discard the stale cached session. Replaying after earlier
    slots began committing is ambiguous and can write into a dead connection.
11. **Never acknowledge unsolicited status during or after a save.** The diffuser
    can emit `0x21` after accepting a routine. Although `0xA1` is its normal
    application acknowledgment, inserting it between `0x14` writes makes this
    firmware close the iPhone connection. Suppress the acknowledgment while the
    save guard or post-save quiet period is active; never defer or replay it.
12. **Opening Edit settings must stay Bluetooth-quiet.** Tapping **Change routine**
    and mounting the intensity screen must not initialize the adapter, query its
    enabled state, or probe the connection. The only allowed traffic is one
    best-effort `0x08` routine read when the intensity screen opens, to preload
    the user's real settings; it runs once and fails silently. Status-only
    connection checks start five seconds after that read, then repeat every five
    seconds. Never use a protocol read as a keepalive while the user edits.



## 4. Reproducing quickly

- Chrome (desktop, Web Bluetooth) reproduces most protocol issues and is much
  faster than an Xcode round trip. iOS-only issues are transport-level.
- A save writes slots 1 through 5 in order. Each enabled routine may produce its
  own confirmation beep; disabled slots are also explicitly written.

## 5. Before saying it is fixed

- Debug log shows every command, chunk write, response, and OS disconnect event.
- Every configured routine is accepted, and the link remains up afterwards.
- Fresh onboarding *and* Edit settings both work on a physical device.

## Protected save and passive status checks

The diffuser drops the link if anything is sent while it commits routines to flash.
All optional reads and keepalives are blocked throughout the five-slot save and for
5 seconds after its final command. Normal five-second screen checks query only the
phone's connection registry and send no bytes to the diffuser. Never add active
`0x08` keepalives to screen polling and never remove the save guard.

Some firmware revisions intentionally close their radio after persistent `0x14`
writes while committing settings. The app cannot prevent a peripheral-initiated
firmware sleep; it must accept the completed save, show the resulting offline state,
and never respond with another command, reconnect, replay, or disconnect call.
