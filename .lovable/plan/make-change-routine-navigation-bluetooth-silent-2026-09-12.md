# Make Change routine navigation Bluetooth-silent

## Changes
- Remove the `0x08` keepalive from the intensity and routine screens; it is the command failing in the supplied log and can disturb the diffuser.
- Prevent the setup screen from initializing or querying the Bluetooth adapter merely because an existing diffuser is being edited.
- Do not run a connection check immediately when **Change routine** opens setup.
- Start the existing status-only connection check five seconds after arrival, then repeat every five seconds on intensity and routine screens.
- Keep the check suspended from the instant **Confirm** is tapped through the complete five-slot save and its post-save quiet window.
- Continue using the native disconnect callback for immediate genuine disconnect alerts.

## Verification
- Confirm tapping **Change routine** produces navigation only: no initialize, isEnabled, getConnectedDevices, getMtu, read, or write call.
- Confirm the first status-only check occurs after five seconds and repeats every five seconds.
- Confirm no `0x08` keepalive is sent while editing.
- Confirm no checks run during saving, and the app still shows the connection-lost prompt when the five-second check or native callback reports a disconnect.
