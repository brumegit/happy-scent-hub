# Fix "Forbidden" in the installed Android app

## What's happening

The native app is a thin shell: it loads the Brume web app from a URL. That URL, currently set to `project--b7e968af-...lovable.app`, returns **403 Forbidden** for anyone outside the Lovable workspace — which is exactly the white "Forbidden" page your tester sees.

The real public site, `https://happy-scent-hub.lovable.app`, is published and returns 200 (it redirects `/` to `/home` as expected).

## Fix

- Point the native shell at the public published URL in `capacitor.config.ts`.
- Bump the Android version (`versionCode 2 -> 3`, `versionName 1.0.1 -> 1.0.2`) so Play accepts a new upload.
- Rebuild the signed, R8-optimized `.aab` with the existing BRUME upload keystore and export it, plus the updated `mapping.txt`.

## After that

Upload the new bundle to Internal testing; your tester updates from Play and the app should load the real screens instead of "Forbidden".

## Note

Whenever you re-publish the web app in Lovable, the native app picks up the new content automatically — no new `.aab` needed unless native config changes.
