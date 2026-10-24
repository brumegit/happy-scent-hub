<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep self-reported onboarding email in the browser-only customer-identity module; use it for support attribution, never to authorize Shopify account or order access.
- Show EmailStep only before a customer's first pairing; customers with saved diffusers and diffuser edits skip it and rely on the guest banner, so returning users are never re-prompted.
- Mount the shared guest email banner on both the diffuser list and setup, including edits, and reserve bottom space wherever it appears so pairing never removes the email entry point or hides controls.
- Route customer-facing error alerts through notifySlackAlert, which also fans out to Bird (full debug trace) and Meta (bare AppError), so every error destination stays in sync.
- Keep inbox visibility and unread-count rules in the browser-safe inbox-messages module so message retention is independently testable.
