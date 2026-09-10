# Restore the confirmed-working diffuser push

## Goal
Return Bluetooth settings delivery to the exact build the user confirmed working immediately before asking how to deploy to the App Store.

## Changes
- Use commit `c9a5c874f923ee3368cb0116461427a2099883e8` as the source of truth.
- Restore `src/lib/push.ts`, `src/lib/bluetooth.ts`, and `src/lib/native-ble.ts` exactly from that release.
- Preserve the current `app.brume.me` native configuration, scrollable privacy page, App Store metadata, and iPhone-only settings.
- Remove all later experimental Bluetooth transport changes, extra write wrappers, and altered success behavior by restoring the complete files rather than combining individual fixes.

## Verification
- Confirm the three restored files are byte-identical to the confirmed-working release.
- Check that no unrelated files changed.
- Verify the app build diagnostics complete successfully.

## Important limitation
The code can be matched exactly and build-verified here, but final Bluetooth confirmation requires one test with the physical diffuser after publishing.