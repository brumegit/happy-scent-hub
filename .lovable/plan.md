# Prevent post-save Bluetooth drops

## What the log shows
- The five routine writes finished successfully by 4.2 seconds.
- The app then sent nothing for about 16 seconds.
- At 20.2 seconds, the next harmless check found the diffuser was already disconnected; that check exposed the drop rather than causing it.

## Changes
- Replace the coarse global quiet timer with a per-diffuser save guard so no check can overlap routine writes.
- Resume one serialized, silent keepalive before the diffuser’s observed idle timeout instead of waiting until after it has already disconnected.
- Ensure duplicate screen timers share the same in-flight keepalive and never generate overlapping Bluetooth traffic.
- Keep all reconnect, disconnect, read-back, and replay actions disabled after a save.
- Expand the trace to distinguish “device disconnected before check” from “check write failed,” then verify the app builds cleanly.

## Technical details
The current four-second polling cadence combined with a twelve-second quiet window can defer the first post-save keepalive to roughly sixteen seconds after the final write. This trace shows that is too late. The save remains five authoritative `0x14` writes; only the post-save idle timing and serialization change.
