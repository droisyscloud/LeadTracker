import { sign } from "./crypto";
import { practiceMode } from "./config";

/** Fire-and-forget outbound webhook (Zapier, Make, Power Automate, Salesforce flows, your own systems). */
export async function fireWebhook(event: string, data: Record<string, unknown>) {
  if (practiceMode()) { console.log("[practice] not sent: fireWebhook"); return; }
  const url = process.env.WEBHOOK_URL;
  if (!url) return;
  const body = JSON.stringify({ event, at: new Date().toISOString(), data });
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-LeadTracker-Event": event };
  if (process.env.WEBHOOK_SECRET) headers["X-LeadTracker-Signature"] = "sha256=" + sign(body, process.env.WEBHOOK_SECRET);
  try { await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(8000) }); }
  catch (e) { console.error("webhook failed", event, e); }
}

/** Plain-text message to a Slack or Microsoft Teams incoming webhook. */
export async function postToChat(text: string) {
  if (practiceMode()) { console.log("[practice] not sent: postToChat"); return; }
  const targets = [process.env.SLACK_WEBHOOK_URL, process.env.TEAMS_WEBHOOK_URL].filter(Boolean) as string[];
  await Promise.all(targets.map((u) => fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(8000) })
    .catch((e) => console.error("chat webhook failed", e))));
}
