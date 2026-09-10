# Fix silent diffuser saves

## What the debug trace proves
- The Bluetooth link is healthy and the app receives a successful `0x93` response.
- The later `0x08` read shows the old routine, so `0x93` is only confirming receipt of the full list; it is not proof that this firmware committed it.
- The app currently turns that receipt into “OK,” which is why the screen reports success without a beep or saved change.

## Change
- Stop treating the full-list `0x13` response as a successful save.
- Compare the requested routine with the initial device read, then send only changed timer slots through the firmware’s persistent single-slot `0x14` command.
- Serialize those writes with a safe pause, and verify once afterward with `0x08`.
- Show “OK” only when the read-back matches; otherwise show an actionable error without automatically repeating writes.
- Keep detailed debug lines for every changed slot, acknowledgment, and final read-back.

## Validation
- Check setup and Change routine use the same save path.
- Confirm one changed time block produces one settings write and no duplicate retry burst.
- Run project checks and confirm the preview build remains healthy.
