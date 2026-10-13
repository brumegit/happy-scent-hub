/**
 * Shopify customer account sign-in (new customer accounts, PKCE public client).
 *
 * Flow: signInWithShopify() redirects to Shopify, Shopify emails the customer
 * a 6-digit code, verifies it, then redirects back to /auth/shopify-callback
 * with an authorization code. completeShopifySignIn() exchanges that code for
 * tokens and reads the customer profile through the Customer Account API.
 *
 * No client secret is used: the customer account client is a public client and
 * PKCE (code_verifier/code_challenge) proves the exchange comes from the same
 * browser that started the sign-in.
 */
import { SHOPIFY_STORE_PERMANENT_DOMAIN } from "@/lib/shopify";

export const SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID = "a6b9e56b-7325-4d64-ab3a-c5b1d584c00d";

const SESSION_KEY = "brume-shopify-session";
const PKCE_VERIFIER_KEY = "brume-shopify-pkce-verifier";
const OAUTH_STATE_KEY = "brume-shopify-oauth-state";
const OAUTH_NONCE_KEY = "brume-shopify-oauth-nonce";

export interface ShopifySession {
  accessToken: string;
  idToken: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  /** Epoch milliseconds when the access token stops being accepted. */
  expiresAt: number;
}

/** The shop's numeric id, resolved once from the Storefront API. */
let shopIdPromise: Promise<string> | null = null;

async function shopId(): Promise<string> {
  shopIdPromise ??= fetch(
    `https://${SHOPIFY_STORE_PERMANENT_DOMAIN}/api/2025-07/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": "410a7d06f3da1da4bf6a30524ef9e4be",
      },
      body: JSON.stringify({ query: "{ shop { id } }" }),
    },
  )
    .then((r) => r.json())
    .then((d) => {
      const gid = String(d?.data?.shop?.id ?? "");
      const id = gid.split("/").pop();
      if (!id) throw new Error("Could not resolve the Shopify shop id.");
      return id;
    });
  return shopIdPromise;
}

function authBase(id: string) {
  return `https://shopify.com/authentication/${id}`;
}

function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function redirectUri(): string {
  return `${window.location.origin}/auth/shopify-callback`;
}

/** Redirects the customer to Shopify's hosted sign-in (email + 6-digit code). */
export async function signInWithShopify(): Promise<void> {
  const id = await shopId();
  const verifier = randomString(32);
  const state = randomString(16);
  const nonce = randomString(16);
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(OAUTH_STATE_KEY, state);
  sessionStorage.setItem(OAUTH_NONCE_KEY, nonce);

  const params = new URLSearchParams({
    client_id: SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: "openid email customer-account-api:full",
    state,
    nonce,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: "S256",
  });
  window.location.assign(`${authBase(id)}/oauth/authorize?${params.toString()}`);
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

/**
 * Runs on the callback route: validates state, exchanges the code for tokens,
 * then reads the customer profile. Throws with a customer-readable message.
 */
export async function completeShopifySignIn(code: string, state: string): Promise<ShopifySession> {
  const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  const nonce = sessionStorage.getItem(OAUTH_NONCE_KEY);
  if (!expectedState || !verifier || state !== expectedState) {
    throw new Error("This sign-in link expired. Please try signing in again.");
  }

  const id = await shopId();
  const tokenResponse = await fetch(`${authBase(id)}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID,
      redirect_uri: redirectUri(),
      code,
      code_verifier: verifier,
    }),
  });
  if (!tokenResponse.ok) throw new Error("Shopify refused the sign-in. Please try again.");
  const tokens = await tokenResponse.json();

  const idToken: string | null = tokens.id_token ?? null;
  if (idToken && nonce) {
    const payload = decodeJwtPayload(idToken);
    if (payload?.nonce && payload.nonce !== nonce) {
      throw new Error("The sign-in could not be verified. Please try again.");
    }
  }

  const accessToken: string = tokens.access_token;
  const session: ShopifySession = {
    accessToken,
    idToken,
    email: null,
    firstName: null,
    lastName: null,
    expiresAt: Date.now() + Number(tokens.expires_in ?? 3600) * 1000,
  };

  try {
    const profile = await fetch(`${authBase(id)}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: accessToken,
      },
      body: JSON.stringify({
        query: "{ customer { firstName lastName emailAddress { emailAddress } } }",
      }),
    }).then((r) => r.json());
    const customer = profile?.data?.customer;
    session.email = customer?.emailAddress?.emailAddress ?? null;
    session.firstName = customer?.firstName ?? null;
    session.lastName = customer?.lastName ?? null;
  } catch {
    // Profile is a nice-to-have; the verified token alone still proves sign-in.
  }

  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  sessionStorage.removeItem(OAUTH_NONCE_KEY);
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

/** The current verified customer, or null when signed out or expired. */
export function getShopifySession(): ShopifySession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as ShopifySession;
    if (!session.accessToken || session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function signOutShopify(): void {
  localStorage.removeItem(SESSION_KEY);
}
