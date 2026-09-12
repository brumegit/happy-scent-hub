# Brume BLE — absolute reference (working version)

This document describes the **only** Bluetooth behaviour known to work end to end
with the diffuser firmware on both iPhone (Capacitor / CoreBluetooth) and Chrome
(Web Bluetooth). Treat every rule here as a hard constraint. If a change requires
breaking one, it must be validated with a **fresh onboarding AND an Edit-settings
save on a physical iPhone** before it is merged.

Companion document: `BLE_DEBUGGING.md` (how to diagnose). This one is the contract.

---

## 1. Architecture in one page

| Layer | File | Responsibility |
| --- | --- | --- |
| Protocol frames | `src/lib/scentlife.ts` | Builds/parses ScentLife V1.0 frames (`0x08` read timers, `0x13` timer list, `0x14` modify timer, 22-byte timer payload) |
| Native transport | `src/lib/native-ble.ts` | Capacitor BLE session cache, service/characteristic selection, `writeWithoutResponse`, disconnect events |
| Transport policy | `src/lib/bluetooth.ts` | Chunking, pacing, save guard, quiet period, liveness, reopen |
| Save logic | `src/lib/push.ts` | `pushSettings` — the authoritative five-slot write |
| Screens | `src/routes/index.tsx`, `src/routes/setup.tsx` | Status polling, navigation, no direct BLE writes |

Transport constants (do not change without hardware testing):

- `CHUNK_SIZE = 20` bytes, `CHUNK_DELAY_MS = 30` ms between chunks.
- **700 ms** between routine commands, owned by `push.ts` only.
- `QUIET_AFTER_COMMAND_MS = 5_000` — no optional traffic for 5 s after a
  persistent write (0x13 / 0x14 only). This protects the flash-commit window.
- `QUIET_AFTER_LIGHT_COMMAND_MS = 600` — short pause after a non-persistent
  command (clock sync `0x06`, status queries). The clock sync sent at pairing
  does not write to flash, so it only blocks 600 ms — not 5 s. This lets the
  one-shot `0x08` settings read run right after pairing instead of waiting 5 s,
  so the intensity screen shows the diffuser's real stored settings immediately.
- Screen status polling: every **5 s**, registry-only, first run 5 s after mount.

---

## 2. The save transaction (authoritative, write-only)

```
beginCommandSequence()           // blocks all optional traffic
  write slot 1 (0x14, persistent)
  wait 700 ms
  write slot 2 … slot 5          // every slot, always five
  (no wait after slot 5)
endCommandSequence()             // starts the 5 s quiet period
```

- **Always five `0x14` writes.** User routines enabled; every unused slot written
  explicitly disabled. This makes the save authoritative even when the device
  cannot be read (iPhone) or another phone changed it.
- **Disabled slots need a valid payload**: `weekdayMask 0x7F`, `startMinute 0`,
  `endMinute 1`, current spray timing. Zeroed fields are rejected by some
  firmware revisions and drop the link.
- **No reads** (`0x08`) before, during or after the save.
- **No connection probe, reconnect, replay, or disconnect** inside the transaction.
- The whole transaction must finish in roughly **3.2 s** — the diffuser closes its
  command window around 4 s.

---

## 3. DO

1. **Do keep saving write-only.** Success = the OS accepted all five writes.
2. **Do write all five slots on every save**, including the disabled ones.
3. **Do serialize** commands: one in flight at a time, 700 ms apart, 20-byte
   chunks 30 ms apart.
4. **Do reuse the live native session** when one exists for that device.
5. **Do reopen the link once only if the very first write is refused** (nothing
   has reached the diffuser yet), then resend that first routine. Never for later slots.
6. **Do poll connection status every 5 s** on the diffuser list and on the
   intensity/schedule screens — and nowhere else. The check sends **zero bytes**:
   the phone's connection registry (`getConnectedDevices`) confirmed by the real
   CoreBluetooth session (`getMtu`). The registry alone keeps listing a
   powered-off diffuser, so both must agree before the UI shows "connected".
7. **Do suspend polling for the whole save** and resume 5 s after it ends.
8. **Do rely on the passive native disconnect event** to show "disconnected".
9. **Do keep names app-only** — room and diffuser names never leave the app.
10. **Do log everything in the debug trace** (taps, screens, TX, chunks, RX,
    disconnects with elapsed time since last write) and show customers only:
    *"We couldn't save your routine. Please contact customer service at contact@brume.me."*
11. **Do test both entry paths** (onboarding and Edit settings) on real hardware.

## 4. DON'T

1. **Don't push a device name to the hardware.** It restarts advertising and kills the link.
2. **Don't use acknowledged writes on iPhone.** Native uses
   `writeWithoutResponse` only; there is no fallback write mode.
3. **Don't wait for `0x94`/reply frames on iPhone.** This firmware does not send
   them; waiting stretches the save past the connection window.
4. **Don't read (`0x08`) as a keepalive**, ever — not on a timer, not between
   routine writes, not after saving. This was the single most common disconnect
   cause. The only allowed read is a **single** best-effort `0x08` when the
   intensity screen opens (or right after pairing), to preload the user's real
   settings. It runs once, status polling is suspended while it runs and only
   starts five seconds after it finishes, and a failure is silent. The clock
   sync (`0x06`) sent at pairing only triggers a 600 ms quiet period (not 5 s),
   so this read can proceed right after pairing — the diffuser's real intensity
   and schedule appear on screen without waiting.

5. **Don't send `0xA1`** (or any acknowledgment of an unsolicited `0x21`) during a
   save or the quiet period. Suppress it; never defer or replay it.
6. **Don't trigger any BLE call on "CHANGE ROUTINE"** — no `initialize`, no
   `isEnabled`, no probe. If the device is already connected, navigate silently.
7. **Don't add a second delay in the transport.** Only `push.ts` waits 700 ms.
   No extra 200 ms, no wait after slot 5.
8. **Don't reconnect or replay mid-save.** Stop, discard the stale session, fail clearly.
9. **Don't call the BLE disconnect API** anywhere in normal flow — pairing,
   editing, saving or polling. There is no user-facing Disconnect action.
10. **Don't switch characteristic just because it is writable.** Keep the proven
    serial service/characteristic (`0000ffe0` / `0000ffe1` family) and subscribe
    only to notifications inside that service. Never write to OTA/DFU channels.
11. **Don't treat a cached session as proof of liveness before a save** — check the
    real native session once, then start writing.
12. **Don't show protocol errors to customers.** Trace stays in the opt-in debug log.
13. **Don't add "helpful" verification read-backs.** Every historical regression
    (silent saves, double beeps, shutdowns, post-save disconnects) came from one.

---

## 5. Expected behaviour on hardware

- One beep per accepted enabled routine. Disabled slots are written silently.
- The diffuser **may close the link itself** after committing to flash. That is a
  firmware sleep, not a bug: accept the completed save, show the offline state,
  send nothing back.
- Reconnection is always user-initiated (double tap the diffuser, then the app
  reconnects on "Change routine").

## 6. Known-good baseline

Transport reference commit: `b12dbe23d17e1eb64781510290205d49af59f992`
(`native-ble.ts`, `bluetooth.ts`, `push.ts`). If iPhone saving regresses, diff
against it before inventing a new mechanism.

## 7. Shipping a change

1. Publish the web app (the native shell loads `https://app.brume.me`).
2. `npx cap sync ios` → Run from Xcode (installs over the previous build).
3. On device: fresh onboarding save **and** Edit-settings save, with debug log on.
4. Confirm: five `0x14` writes, no reads, no probes, no post-save traffic, and the
   diffuser's stored routines match the app exactly.
