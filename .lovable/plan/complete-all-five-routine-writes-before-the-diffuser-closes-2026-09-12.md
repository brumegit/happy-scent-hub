# Complete all five routine writes before the diffuser closes its save window

## Finding
The uploaded trace is deterministic: slots 1–4 are accepted, but slot 5 begins at 3.9 seconds and iOS reports the diffuser has already disconnected. Each slot currently incurs both a 200 ms transport pause and a 700 ms save pause, stretching the five-slot transaction beyond the diffuser’s connection window. The attempted reconnect then retries against a partially committed save and cannot reliably recover.

## Changes
- Remove the duplicate 200 ms delay from the transport layer; keep one 700 ms firmware-settle interval between routine commands only.
- Do not wait after the fifth command, so the complete five-slot save finishes in roughly 3.2 seconds instead of about 4.2 seconds.
- Stop automatic reconnect/replay in the middle of an authoritative save. A partial save must fail clearly rather than replaying a command into firmware that is already committing.
- Preserve the authoritative five-slot behavior: enabled routines are written and every absent slot is explicitly disabled, preventing stale schedules from another phone.
- Correct native stale-session cleanup so any later user-initiated reconnect cannot reuse a dead channel.
- Extend the trace with slot start/finish timing and total transaction duration.

## Verification
- Add a focused timing test confirming five native `0x14` writes start less than 3.5 seconds apart and no delay follows slot 5.
- Confirm exactly five writes occur, with no read, connection probe, reconnect, or replay during or after the save.
- Check the current build and relevant Bluetooth tests.
- Final confirmation still requires one physical iPhone save because the diffuser’s firmware timing cannot be emulated in the browser.
