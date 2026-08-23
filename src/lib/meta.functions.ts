// Thin server function wrapper for Meta Conversions API.
// Client-safe: the handler body is stripped from client bundles; only the
// RPC stub ships. The server-only CAPI helper is dynamically imported inside
// the handler so its getRequest/process.env access never reaches the client.

import { createServerFn } from "@tanstack/react-start";

export const trackMetaEvent = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      eventName: string;
      eventId: string;
      customData: Record<string, unknown> | undefined;
      email: string | null | undefined;
      fbp: string | undefined;
      fbc: string | undefined;
      eventSourceUrl: string | undefined;
    }) => input,
  )
  .handler(async ({ data }) => {
    try {
      const { sendCapiEvent } = await import("./meta-capi.server");
      await sendCapiEvent({
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
