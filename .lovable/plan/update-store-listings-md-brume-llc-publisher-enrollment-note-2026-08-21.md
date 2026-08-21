# Update STORE_LISTINGS.md: BRUME LLC publisher + enrollment notes

## What changes
Edit `STORE_LISTINGS.md` only.

### 1. Publisher identity (Identity section)
- Change `Developer: Brume (Florian Mariencourt)` → `Developer: BRUME LLC (Miami, FL)`.
- Add a one-line note that the App Store seller name will display as "BRUME LLC" and
  that Google Play developer display name is set to "BRUME LLC" (no D-U-N-S required there).

### 2. New "Apple Developer enrollment notes" section (after Identity)
Cover, concisely:
- Enroll as an **Organization** so the seller name is "BRUME LLC".
  Individual enrollment would show the personal legal name and cannot display a company name.
- A D-U-N-S Number is required for BRUME LLC only (Miami, FL). SOUS MARIN SASU
  (French parent) and Florian personally do NOT need one.
- D-U-N-S steps + links:
  - Start at https://developer.apple.com/support/D-U-N-S/ (links to D&B lookup).
  - D&B direct: https://www.dnb.com/duns-number/ → free "Get a D-U-N-S Number" (decline paid expedite).
  - Match legal name + address exactly to the Florida Division of Corporations filing
    (verify on https://search.sunbiz.org).
  - Use a business email on a domain you control.
  - Typical turnaround 1–5 business days, up to ~2 weeks.
- Authority to bind: if Apple requests it, provide BRUME LLC's operating agreement or a
  corporate resolution from SOUS MARIN SASU (sole member) authorizing Florian to act for
  BRUME LLC.
- Fallback path: enroll as an Individual now to start the App Store review clock, request the
  D-U-N-S in parallel, then convert the account Individual → Organization once the number is
  verified. App, bundle ID, and build carry over; only the seller name flips to "BRUME LLC".
- Apple review: ~1–2 days after upload. Google Play: separate, publisher name freely set, no D-U-N-S.

## Out of scope
- No code, route, or native project changes.
- No changes to STORE_LISTINGS.md store copy (descriptions, keywords) beyond the developer line.
