// Server-only Slack helper. Reads connector secrets inside the caller's
// handler body so nothing ever reaches the client bundle.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";
export const SLACK_ALERT_CHANNEL = "C0C0JDP07TR"; // #app

export async function postSlackAlert(text: string): Promise<boolean> {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  // Prefer the bot connection (SLACK_API_KEY_1) so alerts post as the app,
  // not as the workspace user who linked the personal connection.
  const slackApiKey = process.env["SLACK_API_KEY_1"] ?? process.env["SLACK_API_KEY"];
  if (!lovableApiKey || !slackApiKey) {
    console.error("[Slack alerts] missing connector credentials, alert not sent");
    return false;
  }
  try {
    const res = await fetch(`${GATEWAY_URL}/chat.postMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "X-Connection-Api-Key": slackApiKey,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: SLACK_ALERT_CHANNEL,
        text: text.slice(0, 3800),
        unfurl_links: false,
      }),
    });
    if (!res.ok) {
      console.error(`[Slack alerts] gateway HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
      return false;
    }
    const body: { ok?: boolean; error?: string } = await res.json().catch(() => ({}));
    if (!body.ok) {
      console.error(`[Slack alerts] Slack error: ${body.error ?? "unknown"}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Slack alerts] request failed:", err);
    return false;
  }
}
