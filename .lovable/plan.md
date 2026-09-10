# Make iPhone routine transfers single-command

## Finding
- The live onboarding and edit flow does not send the diffuser name, power state, or any hidden configuration during confirmation.
- It currently sends the routine once, then asks the diffuser to read it back. If that reply is missing, it may send up to five additional per-block updates and read again.
- This extra confirmation traffic matches the reported pattern: the routine write can complete, but the diffuser disconnects before the app receives proof and the app reports failure.

## Change
- During onboarding and “Change routine,” send exactly one routine-list command containing intensity and schedule.
- Do not perform pre-read, post-write read-back, or per-block retry commands during that confirmation action.
- Treat completion of the Bluetooth write as success; keep genuine write failures as errors.
- Keep names app-only. Preserve the current clock sync and initial settings read immediately after pairing.

## Verification
- Confirm both onboarding and edit use the same single-command transfer.
- Confirm no name, power, or extra retry command can run from that path.
- Check the app build.
- Final confirmation still requires one test on the physical iPhone and diffuser.
