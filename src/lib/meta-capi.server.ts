// Server-only Meta Conversions API (CAPI) helper.
// Sends events to the Meta Graph API with hashed user data for matching.
// This file is blocked from client bundles by the .server.ts naming convention.

import { getRequest } from "@tanstack/react-start/server";

interface CapiEventInput {
  pixelId: string | undefined;
  eventName: string;
  eventId: string;
  eventTime: number;
  customData: Record<string, unknown> | undefined;
  email: string | null | undefined;
  fbp: string | undefined;
  fbc: string | undefined;
  eventSourceUrl: string | undefined;
}

/** SHA-256 hash a string and return hex — for PII hashing before sending to Meta. */
async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Extract the client IP from common proxy/CDN headers. */
function getClientIp(request: Request | null): string {
  if (!request) return "";
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  return "";
}

/**
 * Send a single event to Meta via the Conversions API.
 * Failures are logged but never thrown — tracking must not break the app.
 */
export async function sendCapiEvent(input: CapiEventInput): Promise<void> {
  // The access token is the only server-only secret. The Pixel ID is public
  // (it's in the page source) so the client passes it in.
  const accessToken = process.env["META_CAPI_ACCESS_TOKEN"];
  const pixelId = input.pixelId;
  if (!pixelId || !accessToken) return;

  const request = getRequest();
  const userAgent = request?.headers.get("user-agent") ?? "";
  const clientIp = getClientIp(request);

  // Build user_data with hashed email + browser identifiers for matching.
  const userData: Record<string, string> = {};
  if (clientIp) userData["client_ip_address"] = clientIp;
  if (userAgent) userData["client_user_agent"] = userAgent;
  if (input.fbp) userData["fbp"] = input.fbp;
  if (input.fbc) userData["fbc"] = input.fbc;
  if (input.email) {
    userData["em"] = await sha256Hex(input.email.trim().toLowerCase());
  }

  const event: Record<string, unknown> = {
    event_name: input.eventName,
    event_id: input.eventId,
    event_time: Math.floor(input.eventTime / 1000),
    action_source: "website",
    user_data: userData,
  };

  if (input.customData) event["custom_data"] = input.customData;
  if (input.eventSourceUrl) event["event_source_url"] = input.eventSourceUrl;

  const payload = { data: [event] };
  const url = `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${accessToken}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(
        `[Meta CAPI] ${res.status}:`,
        await res.text().catch(() => ""),
      );
    }
  } catch (err) {
    console.error("[Meta CAPI] fetch failed:", err);
  }
}
