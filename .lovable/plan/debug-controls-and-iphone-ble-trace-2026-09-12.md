# Debug controls and iPhone BLE trace

## Changes
- Keep the two debug controls floating, positioned immediately below the app header so they do not cover navigation.
- Diagnose the uploaded iPhone trace against the current connection, notification, acknowledgment, and routine-write flow.
- Fix only the confirmed BLE issue, preserving the five-slot authoritative save behavior.
- Verify the app compiles and the controls render without obscuring the page.

## Technical details
- Use a shared header-height offset plus the iPhone safe area for stable placement.
- Treat the trace's stale initial connection separately from the successful reconnect and completed slot acknowledgments.
- Remove any unintended duplicate protocol acknowledgments or post-write traffic if confirmed by the code path.
