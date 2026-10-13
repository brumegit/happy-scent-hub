// Fire-and-forget Slack alerts from the customer app. Never blocks the UI and
// never throws: an alert failure must not disturb the flow it reports on.
// Deduplicates identical alerts within a minute so a fast retry loop does not
// flood the team channel.

import { sendSlackAlert } from "./slack-alerts.functions";
import type { SlackAlertKind } from "./slack-alerts.functions";

type AlertPayload = {
  kind: SlackAlertKind;
  message: string;
  room?: string | undefined;
  context?: string | undefined;
};

const DEDUPE_MS = 60_000;
const recent = new Map<string, number>();

export function notifySlackAlert(payload: AlertPayload): void {
  if (typeof window === "undefined") return;
  const key = `${payload.kind}|${payload.message}`;
  const now = Date.now();
  const last = recent.get(key) ?? 0;
  if (now - last < DEDUPE_MS) return;
  recent.set(key, now);
  if (recent.size > 50) {
    for (const [k, t] of recent) {
      if (now - t > DEDUPE_MS) recent.delete(k);
    }
  }
  void sendSlackAlert({ data: payload }).catch(() => {
    // Silent: alerting must never interrupt the customer's flow.
  });
}
