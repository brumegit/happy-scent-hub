# Fix iPhone saves and Bluetooth status

## Changes
- Restore the proven iPhone write behavior: use the original native writable channel selection and write-without-response path, while retaining safe notification byte handling.
- Remove automatic reconnect traffic after saving; stop immediately after each requested routine is written so firmware is not disturbed.
- Make connection status event-driven as well as polling-based: listen for browser/native disconnects, run an immediate check on each setup step, and keep the five-second fallback check.
- Ensure every Bluetooth failure explains whether the link, permission, radio, or routine write failed.
- Replace all green success visuals with the existing champagne brand color.

## Verification
- Check the browser pairing, disconnect, and status-update flow against the live preview.
- Check TypeScript, tests, and the preview build.
- Confirm the native shell still targets `app.brume.me`, remains iPhone-only, and privacy stays independently scrollable.
- Republish before physical iPhone testing; browser tools cannot reproduce CoreBluetooth timing.
