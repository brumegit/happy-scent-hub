# Prevent stale Bluetooth sessions from failing setup saves

## Finding
The uploaded log fails before any routine bytes leave the iPhone. The app labels the connection “live” from its cached link, but iOS already reports “Not connected.” A five-second connection check can also already be in flight when Confirm is tapped; the current screen guard ignores its UI result but does not coordinate that check with the save.

## Changes
- Start the protected save window immediately when Confirm is tapped, then resolve the real iPhone connection state before writing slot 1.
- Reuse any connection check already in flight instead of starting a competing Bluetooth operation.
- If iOS reports the link is stale before the first write, reopen it once before any routine is sent.
- Keep the existing safety rule during the five-slot transaction: no checks, reconnects, reads, or replays between routine writes or afterward.
- Update the trace to distinguish cached link state, pre-save validation, reconnection, and the first actual routine write.

## Verification
- Add or update focused checks for a stale cached session and an in-flight five-second check at Confirm.
- Confirm exactly five routine writes occur after a successful pre-save validation, with no Bluetooth operation interleaved.
- Confirm a failed pre-save reconnect sends zero routine writes and shows the short customer-service message.
- Check the current build and Bluetooth tests. Final confirmation requires one physical iPhone save.
