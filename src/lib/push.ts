import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { getState, setState } from "./jobstate";
import { appUrl } from "./config";
import { practiceMode } from "./config";

/**
 * Web Push: notifications on phones and computers that turned them on (Account page).
 * Keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, or are created once and stored in the database,
 * so nothing has to be set up for it to work.
 */
let keys: { publicKey: string; privateKey: string } | null = null;
export async function vapidKeys() {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  else {
    const saved = (await getState("vapid")) as { publicKey?: string; privateKey?: string } | null;
    if (saved?.publicKey && saved.privateKey) keys = { publicKey: saved.publicKey, privateKey: saved.privateKey };
    else { keys = webpush.generateVAPIDKeys(); await setState("vapid", keys); }
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || `mailto:${process.env.MAIL_FROM_ADDRESS || process.env.COMPANY_EMAIL || "admin@example.com"}`, keys.publicKey, keys.privateKey);
  return keys;
}

export type PushMsg = { title: string; body: string; url?: string; tag?: string };
/** Send to every device of these people. Dead subscriptions (uninstalled, permission removed) are cleaned up. */
export async function pushTo(userIds: string[], msg: PushMsg) {
  if (practiceMode()) { console.log("[practice] not sent: pushTo"); return; }
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length || process.env.PUSH_DISABLED === "true") return 0;
  const subs = await db.select().from(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.userId, ids));
  if (!subs.length) return 0;
  await vapidKeys();
  const payload = JSON.stringify({ ...msg, url: msg.url ? new URL(msg.url, appUrl()).pathname + new URL(msg.url, appUrl()).search : "/home", icon: "/icons/icon-192.png" });
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600, urgency: "normal", topic: msg.tag?.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, "") || undefined });
      sent++; await db.update(schema.pushSubscriptions).set({ lastSentAt: new Date() }).where(eq(schema.pushSubscriptions.id, s.id));
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, s.id));
      else console.error("push failed", code, (e as Error).message);
    }
  }));
  return sent;
}
