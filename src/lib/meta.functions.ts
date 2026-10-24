// Thin server function wrapper for Meta Conversions API.
// Client-safe: the handler body is stripped from client bundles; only the
// RPC stub ships. The server-only CAPI helper is dynamically imported inside
// the handler so its getRequest/process.env access never reaches the client.

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { trackingAllowed, TRACKING_NOTICE_VERSION, type TrackingStatus } from "./tracking-policy";

export const trackMetaEvent = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      pixelId: string | undefined;
      eventName: string;
      eventId: string;
      customData: Record<string, unknown> | undefined;
      email: string | null | undefined;
      fbp: string | undefined;
      fbc: string | undefined;
      eventSourceUrl: string | undefined;
      permission?: { platform: string; status: TrackingStatus; region: string | undefined; noticeVersion: string } | undefined;
    }) => input,
  )
  .handler(async ({ data }) => {
    const permission = data.permission;
    // Recheck the originating region at send time, not just the browser flag.
    const region = getRequest().headers.get("cf-ipcountry") ?? undefined;
    if (!permission || permission.noticeVersion !== TRACKING_NOTICE_VERSION ||
        !trackingAllowed(permission.platform, permission.status, permission.region) ||
        !trackingAllowed(permission.platform, permission.status, region)) return { ok: false };
    try {
      const { sendCapiEvent } = await import("./meta-capi.server");
      await sendCapiEvent({
        pixelId: data.pixelId,
        eventName: data.eventName,
        eventId: data.eventId,
        eventTime: Date.now(),
        customData: data.customData,
        email: data.email,
        fbp: data.fbp,
        fbc: data.fbc,
        eventSourceUrl: data.eventSourceUrl,
      });
      return { ok: true };
    } catch (err) {
      console.error("[Meta CAPI] handler error:", err);
      return { ok: false };
    }
  });
