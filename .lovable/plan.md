# Stabilize routine changes and use champagne for success

## Change
- Replace every green success treatment with the existing champagne brand color, including the “OK” action, diagnostic indicators, and debug banner.
- Keep routine confirmation to one timer-list command containing only intensity and schedule.
- Prevent automatic battery/status acknowledgments from adding hidden Bluetooth writes while that routine command is being transmitted and briefly afterward.
- Treat a completed routine write as successful even when the diffuser intentionally drops its Bluetooth connection immediately after applying it; still show genuine write failures.

## Verification
- Confirm onboarding and “Change routine” share the same isolated one-command transfer.
- Confirm no name, power, read-back, retry, or status-ack command can run during that transfer.
- Check success styling and the app build.
- Final hardware confirmation requires one iPhone and diffuser test.
