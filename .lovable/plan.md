# Simplify debug controls

## Changes
- Remove the expanded read and push diagnostic strips from the top of every screen.
- Replace the current bottom debug controls with a compact floating bar at the top.
- Put **Open debug log** on the left and **Exit debug mode** immediately beside it on the right.
- Keep the existing scrollable log, Copy, Share, and Close actions unchanged.

## Technical details
- Update the shared app layout so the old diagnostic strips are no longer mounted.
- Restyle the two remaining debug actions as an unobtrusive safe-area-aware overlay that does not push page content down.
- Preserve the hidden 10-tap logo activation and all Bluetooth logging.
