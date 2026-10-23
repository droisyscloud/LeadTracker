import { getState, setState } from "./jobstate";
import { postToChat } from "./webhooks";
import { practiceMode } from "./config";

/**
 * Team alerts in a Google Chat space (and Slack/Teams if those are configured).
 * An admin pastes the space's webhook link on the Settings page and picks which events to post.
 */
export type ChatEvent = "dealWon" | "booking" | "hotReply" | "webLead" | "dailySummary" | "weeklyDigest";
export const CHAT_EVENTS: [ChatEvent, string][] = [
  ["dealWon", "A deal is won"], ["booking", "A lead books a meeting on a booking page"], ["hotReply", "A hot lead (4 stars and up) replies"],
  ["webLead", "A new lead arrives from the website form"], ["dailySummary", "Daily team summary"], ["weeklyDigest", "Monday team digest for managers"],
];
export type ChatSettings = { googleChatUrl: string; events: Record<ChatEvent, boolean> };
const ALL_ON = Object.fromEntries(CHAT_EVENTS.map(([k]) => [k, true])) as Record<ChatEvent, boolean>;

export async function chatSettings(): Promise<ChatSettings> {
  const s = (await getState("chat")) as Partial<ChatSettings> | null;
  return { googleChatUrl: s?.googleChatUrl || process.env.GOOGLE_CHAT_WEBHOOK_URL || "", events: { ...ALL_ON, ...(s?.events || {}) } };
}
export async function saveChatSettings(s: ChatSettings) { await setState("chat", s); }

/** Only real Google Chat webhook links are accepted, so the server can't be pointed at anything else. */
export function validChatUrl(u: string) {
  const base = process.env.GOOGLE_CHAT_API_BASE || "https://chat.googleapis.com";
  try { const x = new URL(u); return u.startsWith(`${base}/v1/spaces/`) && x.searchParams.has("key") && x.searchParams.has("token"); } catch { return false; }
}

export async function sendGoogleChat(url: string, text: string) {
  if (practiceMode()) { console.log("[practice] not sent: sendGoogleChat"); return; }
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Google Chat answered ${r.status}`);
}

/** Post an alert for an event, if that event is switched on. Never throws. */
export async function announce(event: ChatEvent, text: string) {
  try {
    const s = await chatSettings();
    if (s.events[event] === false) return;
    if (s.googleChatUrl && validChatUrl(s.googleChatUrl)) await sendGoogleChat(s.googleChatUrl, text).catch((e) => console.error("google chat failed", e));
    await postToChat(text);
  } catch (e) { console.error("announce failed", e); }
}
