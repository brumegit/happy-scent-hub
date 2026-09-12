# Restore reliable Bluetooth connection monitoring

## Changes
- Restore the real native iPhone connection check so stale in-memory “connected” state cannot survive an iOS disconnect.
- Run the check every five seconds on the diffuser list and during the intensity and routine steps.
- Keep only one native check in flight per diffuser and avoid a second check inside each routine write.
- When a check fails during setup, show the existing Bluetooth connection-lost popup and return to the connect step.
- When it fails on the diffuser list, immediately show the diffuser as offline and require pairing before settings can be changed.

## Validation
- Confirm the app builds successfully.
- Verify the polling intervals are exactly five seconds and routine saving does not trigger duplicate connection probes.
