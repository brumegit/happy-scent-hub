import { getShopifySession } from "./shopify-auth";

const EMAIL_KEY = "brume-contact-email";
let enteredEmail: string | null = null;

export function normalizeContactEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

// Self-reported contact information, never proof of Shopify account ownership.
export function getContactEmail(): string | null {
  if (typeof window === "undefined") return null;
  const verifiedEmail = getShopifySession()?.email;
  if (verifiedEmail) return verifiedEmail;
  if (enteredEmail) return enteredEmail;
  try {
    return normalizeContactEmail(localStorage.getItem(EMAIL_KEY) ?? "");
  } catch {
    return null;
  }
}

export function saveContactEmail(value: string): boolean {
  const email = normalizeContactEmail(value);
  if (!email || typeof window === "undefined") return false;
  enteredEmail = email;
  try {
    localStorage.setItem(EMAIL_KEY, email);
  } catch {
    // Still usable for support during this app visit if storage is unavailable.
  }
  return true;
}