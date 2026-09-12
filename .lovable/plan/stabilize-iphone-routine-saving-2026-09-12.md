# Stabilize iPhone routine saving

## Changes
- Remove the unnecessary delay before the first routine write, so saving starts immediately while the Bluetooth link is active.
- Keep the five routine-slot writes serialized and preserve the existing rule of sending nothing after the final write.
- Keep technical Bluetooth details in the opt-in debug log only.
- Replace the large customer-facing diagnostic with a short failure message directing users to contact@brume.me.

## Verification
- Check the affected setup flow and compile the updated app.
- Confirm the normal error screen contains no command bytes, internal step names, or trace history.
