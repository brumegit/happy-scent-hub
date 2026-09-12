# Make Confirm write-only

## Finding
The trace shows the newly added iPhone connection-registry check ran immediately before slot 1, then the write failed. The setup screen also still sends a routine-read keepalive every 15 seconds. Both violate the intended write-only save path and can overlap the transition into saving.

## Changes
- Remove the pre-save connection check and automatic reconnect from Confirm.
- Remove the setup routine-read keepalive entirely.
- Keep the requested five-second connection display check while editing, but never call it from the save path.
- On Confirm, synchronously block monitoring and immediately send only the five authoritative routine writes.
- Keep no reads, probes, reconnects, or replays between writes or after the final write.

## Verification
- Confirm the save path contains exactly five `0x14` routine writes and no `0x08`, connection query, or reconnect.
- Confirm the five-second connection display check remains active only outside saving.
- Check the build and source safeguards. Physical confirmation still requires one iPhone test.
