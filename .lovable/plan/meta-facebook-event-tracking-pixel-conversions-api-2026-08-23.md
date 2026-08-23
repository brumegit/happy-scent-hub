# Meta (Facebook) event tracking — Pixel + Conversions API

## What you need to set up on Meta

You're creating a Facebook App on developers.facebook.com, but **Pixel + CAPI doesn't need the app dashboard**. The two things you actually need both come from **Meta Events Manager** (business.facebook.com/events_manager):

1. **A Meta Pixel** — Events Manager → Data Sources → Add → Web → Meta Pixel. Name it (e.g. "Brume App"). This gives you a numeric **Pixel ID** (~15 digits). You'll save this as `VITE_META_PIXEL_ID`.

2. **A Conversions API access token** — open that Pixel → Settings tab → scroll to "Conversions API" → "Generate access token". Copy it immediately (Meta only shows it once). You'll save this as `META_CAPI_ACCESS_TOKEN` (a server-only secret).

The Facebook App you're creating can stay as-is — it's useful later for login or advanced matching, but the Pixel and token above are all the implementation needs.

I'll request both via the secure secret form once you confirm you have them.

## Events to track (3 events, deduplicated client + server)

| Event | Meta standard name | When it fires | Why |
|---|---|---|---|
| App open | `PageView` + custom `AppOpen` | App loads (root component mount, once per session) | Retargeting, install attribution |
| Diffuser paired | `Lead` | `setup.tsx` pairing succeeds (phase → "paired") | Mid-funnel activation signal |
| Finished setup | `CompleteRegistration` | `setup.tsx` schedule push succeeds, only on first setup (not edits) | The key conversion — ad optimization target |

Each event fires **twice** with the same `event_id`: once from the client Pixel, once from the server CAPI. Meta deduplicates them, so you get reliable coverage even when ad blockers kill the Pixel.

## Implementation

### 1. Client-side Pixel — `src/lib/meta-pixel.ts`

- Loads the `fbq` base script on first mount (guarded by `useHydrated` / `typeof window`)
- Exposes `pixelTrack(eventName, data, eventId)` → calls `fbq('track', eventName, data, { eventID })`
- Reads the Pixel ID from `import.meta.env.VITE_META_PIXEL_ID`
- Also exposes `getFbp()` / `getFbc()` to read the `_fbp` / `_fbc` cookies for CAPI user matching

### 2. Server-side CAPI — `src/lib/meta-capi.server.ts` + `src/lib/meta.functions.ts`

- `meta-capi.server.ts` (server-only): POSTs to `https://graph.facebook.com/v21.0/{pixelId}/events` with the access token, event payload, and hashed user data (SHA-256 email from identity store, plus `fbp`/`fbc` passed from the client)
- `meta.functions.ts` (thin server fn wrapper, client-safe): `trackMetaEvent({ eventName, eventId, customData, fbp, fbc })` — reads `META_CAPI_ACCESS_TOKEN` and `META_PIXEL_ID` inside the handler, calls the CAPI helper. Failures are caught silently (tracking must never break the app)

### 3. Deduplication wrapper — `src/lib/meta.ts` (client-safe)

- `trackEvent(eventName, data?)`: generates a `crypto.randomUUID()` event ID, fires the client Pixel and the server function in parallel with that same ID
- Reads the user's email from `identityStore` and passes it (hashed server-side) for better ad matching when available

### 4. Event triggers wired into existing code

- **App open**: `__root.tsx` — `useEffect` on mount, `trackEvent('PageView')` then `trackEvent('AppOpen')` (custom, once per session via a `sessionStorage` guard)
- **Diffuser paired**: `setup.tsx` → `handlePair()`, after `setPhase("paired")` (line ~129)
- **Finished setup**: `setup.tsx` → `push()` success callback (line ~171), guarded to fire only when `!editing` (first-time setup, not edits)

### 5. Secrets

| Secret name | Where it's used | Public? |
|---|---|---|
| `VITE_META_PIXEL_ID` | Client Pixel init | Yes — it's visible in page source anyway |
| `META_PIXEL_ID` | Server CAPI endpoint URL | Yes, but stored server-side for reliability |
| `META_CAPI_ACCESS_TOKEN` | Server CAPI auth header | No — server-only, never exposed to client |

You'll enter the same Pixel ID value for both `VITE_META_PIXEL_ID` and `META_PIXEL_ID`.

## Why this approach fits the app

- The app is a Capacitor webview loading the published web app — the Pixel runs inside that webview exactly like on a website, no native SDK needed
- CAPI runs as a TanStack server function on the published app, so it works for web and mobile users identically
- Email hashing for CAPI user matching leverages the Shopify email you already collect, improving Meta's ability to attribute ad-driven installs
- No new npm packages — just `fetch`, `crypto.randomUUID()`, and `crypto.subtle` (all available in the worker runtime)

## After publishing

Once implemented and secrets are set, you'll need to **publish the app** for the CAPI server function to go live. Then verify events are arriving in Events Manager (test with the "Test events" tool using your Pixel). Meta should show both Pixel and CAPI events, deduplicated.
