# Fix Play upload: version code already used

Google Play rejects the bundle because version code 1 was already uploaded to this app. Each upload needs a higher, never-reused version code.

## What to change

- Bump the Android version in `android/app/build.gradle`: `versionCode 1` -> `2`, `versionName "1.0"` -> `"1.0.1"`.
- Rebuild the signed, R8-optimized release bundle with the existing BRUME upload keystore.
- Export the fresh `.aab` and the updated deobfuscation `mapping.txt` for you to upload.

## Notes

- Same signing key as before, so Play will accept it as an update.
- Going forward, every new upload needs the version code bumped again (3, 4, ...). I can do that each time you ask for a build.
