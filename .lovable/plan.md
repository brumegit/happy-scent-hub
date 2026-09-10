# Restore the confirmed iPhone Bluetooth path

## Finding
The last explicit successful physical-iPhone test was immediately after checkpoint `b12dbe23d17e1eb64781510290205d49af59f992` (September 8, followed by “now it works”).

Since that checkpoint, only three files in the settings transport changed materially:
- Native iOS writes were changed from the proven `writeWithoutResponse`-first behavior to `write` with response.
- Bluetooth channel selection and notification handling were rewritten.
- Extra confirmation/read-back and status-listener coordination were added.

The acknowledged-write change is the strongest direct cause of the current symptom: iOS reports that the local write completed, the app can show success, but this diffuser rejects/drops that GATT path and disconnects without applying the settings.

## Changes
- Restore `src/lib/native-ble.ts`, `src/lib/bluetooth.ts`, and `src/lib/push.ts` byte-for-byte from the confirmed-working checkpoint.
- Do not retain any later experimental write-mode, channel-selection, timeout, read-back, or status-listener changes.
- Preserve the current `app.brume.me` native configuration.
- Preserve iPhone-only compatibility and the scrollable privacy page.

## Verification
- Confirm all three restored files exactly match the known-working checkpoint.
- Confirm `capacitor.config.ts` still points to `https://app.brume.me`.
- Confirm iPad compatibility remains disabled.
- Confirm the privacy page remains independently scrollable.
- Check the app build result.

## Device retest
After publishing, pull the update on the Mac, run `npx cap sync ios`, reinstall with Xcode, pair, and push one simple schedule. The final physical BLE confirmation must be tested on the diffuser because this environment cannot emulate its iPhone GATT behavior.
