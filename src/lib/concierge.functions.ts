import { createServerFn } from "@tanstack/react-start";

/**
 * Sends a concierge request (with the diffuser debug log) to Brume support.
 * The customer's own address is set as reply-to so support can answer directly.
 */
export const sendConciergeRequest = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; log: string }) => {
    const email = String(input?.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error("Enter a valid email address.");
    }
    const log = String(input?.log ?? "").slice(0, 20000);
    return { email, log };
  })
  .handler(async ({ data }) => {
    const { sendTemplateEmail } = await import("./email-templates/send-email");
    const result = await sendTemplateEmail("concierge-request", "contact@brume.me", {
      templateData: {
        customerEmail: data.email,
        message:
          "Hello, I ran into an issue while configuring my diffuser. Please see the log below and come back to me as soon as possible.",
        log: data.log || "No log captured.",
      },
      replyTo: data.email,
      idempotencyKey: `concierge-${data.email}-${Date.now()}`,
    });
    return { sent: result?.sent !== false };
  });
