# Fix iPhone diffuser settings reads

## Changes
- Keep the proven iPhone write mode unchanged.
- Only prefer a native Bluetooth channel when its notification listener actually starts successfully.
- Preserve the exact byte range delivered by iOS notifications so protocol frames are not polluted by unrelated buffer bytes.
- Allow slower native iPhone responses enough time to arrive before reporting that settings could not be read.

## Verification
- Check TypeScript and the app build.
- Confirm the native shell still points to `app.brume.me`, remains iPhone-only, and the privacy page stays independently scrollable.
- Retest on a physical diffuser after publishing; the browser cannot reproduce iPhone notification timing.
