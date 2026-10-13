// Customer alerting to the team's Slack channel (#app). Client-safe module:
// the handler body is stripped from client bundles, only the RPC stub ships.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type SlackAlertKind =
  | "push_failed"
  | "pairing_failed"
  | "connection_lost"
  | "bluetooth_unavailable"
  | "support_request"
  | "test_error";

const KIND_LABEL: Record<SlackAlertKind, string> = {
  push_failed: "Settings push failed",
  pairing_failed: "Pairing failed",
  connection_lost: "Bluetooth connection lost",
  bluetooth_unavailable: "Bluetooth unavailable",
  support_request: "Customer asked for help",
  test_error: "Test error (debug mode)",
};

const payloadSchema = z.object({
  kind: z.enum([
    "push_failed",
    "pairing_failed",
    "connection_lost",
    "bluetooth_unavailable",
    "support_request",
    "test_error",
  ]),
  message: z.string().max(2000),
  room: z.string().max(60).optional(),
  context: z.string().max(600).optional(),
  email: z.string().email().max(200).optional(),
  hotjarUserId: z.string().max(100).optional(),
  log: z.string().max(3000).optional(),
});

export const sendSlackAlert = createServerFn({ method: "POST" })
  .inputValidator((input) => payloadSchema.parse(input))
  .handler(async ({ data }) => {
    const { postSlackAlert } = await import("./slack.server");
    const lines = [
      `${KIND_LABEL[data.kind] ?? data.kind}`,
      data.message.trim() || "(no detail)",
    ];
    lines.push(`Customer: ${data.email ?? "unknown (not signed in)"}`);
    lines.push(`Hotjar user ID: ${data.hotjarUserId ?? "not available"}`);
    if (data.room) lines.push(`Room: ${data.room}`);
    if (data.context) lines.push(data.context.trim());
    lines.push(`When: ${new Date().toISOString()} UTC`);
    if (data.log) lines.push("Last log lines:\n```" + data.log.replace(/```/g, "'''") + "```");
    await postSlackAlert(lines.join("\n"));
    return { ok: true };
  });
