# Stabilize iPhone routine updates

## What will change
- Remove the hardware-name command and all helpers that can build it, so no path can ever send a diffuser name.
- Make reconnecting for “Change routine” run the same proven initialization sequence as first-time setup before opening the editor.
- Restrict Bluetooth writes to the diffuser’s actual serial service/characteristic instead of accepting the first writable characteristic, avoiding accidental writes to update/control channels that can reboot or disconnect it.
- Serialize all Bluetooth writes so status acknowledgments, clock setup, reads, and routine packets can never overlap.
- Keep the routine update to the protocol’s required timer command and only show “OK” after the device remains connected through the settling period.

## Verification
- Search the complete app to confirm no device-name frame or command remains.
- Add focused protocol/transport checks where practical and verify the app build.
- Keep the on-device debug trace explicit about command numbers and disconnect timing; final confirmation still requires testing with the physical iPhone and diffuser.

## Technical details
- The current routine payload is command `0x13`; hardware naming is command `0x52` and will be removed completely.
- First-time setup currently performs clock synchronization and a timer read after connecting, while the reconnect path used by “Change routine” skips that initialization. Both paths will be unified.
- Characteristic selection will prefer known transparent-UART services and a notify/write pair, never an arbitrary writable characteristic.
