# Stabilize setup connection and refine controls

## Changes
- Replace the native setup transition’s active Bluetooth probe with a passive session-state check, so tapping Continue/Next does not send a Bluetooth operation that can drop the diffuser.
- Preserve the five-second connection monitor and native disconnect popup, but make monitoring observational; keep command traffic out of CTA transitions and prevent overlapping keepalive/save activity.
- Set both room-pill rows to a steady 5 px/second in opposite directions, with reliable sub-pixel movement and edge-to-edge overflow.
- Match pill typography to the room-name field except for muted color, while shortening horizontal pill padding.
- Make each routine’s Starts/Stops time area span the full available width, with equal-width controls.
- Style Starts and Stops like the Back label: the same size, muted color, normal casing, and letter spacing.

## Validation
- Verify tapping Continue and Next does not trigger a native Bluetooth command or a false connection-lost popup.
- Verify the five-second monitor still reacts to an actual native disconnect.
- Check both pill rows move at 5 px/second in opposite directions and remain draggable.
- Check routine time controls fill the width on mobile without clipping.
- Confirm the app builds successfully.
