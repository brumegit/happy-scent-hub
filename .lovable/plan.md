# Keep the diffuser connected

## Changes
- Remove all automatic disconnect and reconnect cycles from normal pairing, editing, saving, polling, and status handling.
- Stop sending the optional pre-save routine read that has repeatedly destabilized iPhone connections.
- Keep the existing five-slot authoritative save: write each routine or disabled slot once, in order, with no traffic after the final write.
- Make liveness checks observational only: update the screen when the operating system reports a real disconnect, but never close or reopen the link automatically.
- Remove the user-facing Disconnect action so only removing the diffuser or an actual device/OS disconnect changes the connection state.
- Keep detailed logs for every command and genuine operating-system disconnect event.

## Technical details
- Native connection setup will reuse a truly live connection and will never call the Bluetooth disconnect API as part of reconnection setup.
- Write failures will stop immediately with a clear wake-and-pair message rather than attempting an automatic reconnect that tears down the session.
- Status-report acknowledgments remain deduplicated and serialized because the diffuser protocol requires them.

## Verification
- Confirm there are no app-initiated disconnect calls in the save, edit, polling, or reconnect paths.
- Confirm saving sends exactly five `0x14` commands and nothing afterward.
- Check the current build and Bluetooth unit/type checks.
- Physical iPhone confirmation still requires publishing and testing with the diffuser.
