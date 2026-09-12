# Keep Bluetooth connected after saving

## Finding
- The uploaded trace confirms all five routine commands finish successfully in 3.18 seconds.
- The diffuser then sends its final `0x21` status report, but the app suppresses the required `0xA1` acknowledgment because the five-second quiet window still treats the save as protected.
- Earlier versions acknowledged status reports normally. Suppression was later added to stop acknowledgments from being interleaved between routine writes.

## Change
- Continue suppressing `0xA1` while slots 1–5 are actively being written, so no command interrupts the save.
- Once slot 5 has completed, acknowledge the final `0x21` report even during the post-save quiet window.
- Keep reads, connection probes, reconnects, and routine retries blocked after saving.
- Log whether a status acknowledgment was suppressed during writes or sent after the completed save.

## Verification
- Confirm the save still sends exactly five `0x14` routine commands.
- Confirm no `0xA1` is sent between those five commands.
- Confirm the final post-save `0x21` receives exactly one `0xA1` acknowledgment.
- Check the build; final connection behavior requires one physical iPhone test.
