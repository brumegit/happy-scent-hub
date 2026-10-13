// Customer alerting to the team's Slack channel (#app). Client-safe module:
// the handler body is stripped from client bundles, only the RPC stub ships.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type SlackAlertKind =
  | "push_failed"
  | "pairing_failed"
  | "connection_lost"
  | "bluetooth_unavailable"
  | "support_request";

const KIND_LABEL: Record<SlackAlertKind, string> = {
  push_failed: "Settings push failed",
  pairing_failed: "Pairing failed",
  connection_lost: "Bluetooth connection lost",
  bluetooth_unavailable: "Bluetooth unavailable",
  support_request: "Customer asked for help",
};

const payloadSchema = z.object({
  kind: z.enum([
    "push_failed",
    "pairing_failed",
    "connection_lost",
    "bluetooth_unavailable",
    "support_request",
  ]),
  message: z.string().max(2000),
  room: z.string().max(60).optional(),
  context: z.string().max(600).optional(),
});

export const sendSlackAlert = createServerFn({ method: "POST" })
  .inputValidator((input) => payloadSchema.parse(input))
  .handler(async ({ data }) => {
    const { postSlackAlert } = await import("./slack.server");
    const lines = [
      `${KIND_LABEL[data.kind] ?? data.kind}`,
      data.message.trim() || "(no detail)",
    ];
    if (data.room) lines.push(`Room: ${data.room}`);
    if (data.context) lines.push(data.context.trim());
    lines.push(`Page: ${new Date().toISOString()} UTC`);
    await postSlackAlert(lines.join("\n"));
    return { ok: true };
  });
