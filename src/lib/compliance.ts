import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { appUrl } from "./config";
import { getState } from "./jobstate";
import { addNotifications } from "./notify";
import { company } from "./brand";

/**
 * Email compliance (CAN-SPAM, and Gmail/Yahoo's bulk-sender rules):
 * every automated follow-up carries the company's postal address and a working one-click unsubscribe.
 * Unsubscribing stops every sequence for that person and blocks further email from the app.
 */
const secret = () => process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "dev-secret";
const sig = (id: string) => createHmac("sha256", secret()).update(`unsub:${id}`).digest("base64url").slice(0, 22);
export const unsubToken = (contactId: string) => `${contactId}.${sig(contactId)}`;
export function readUnsubToken(token: string): string | null {
  const [id, s] = token.split(".");
  if (!id || !s || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const want = Buffer.from(sig(id)), got = Buffer.from(s);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}
export const unsubPage = (contactId: string) => `${appUrl()}/u/${unsubToken(contactId)}`;

export const DEFAULT_ADDRESS = "";
export async function postalAddress(): Promise<string> {
  const s = (await getState("org")) as { postalAddress?: string } | null;
  return (s?.postalAddress || process.env.COMPANY_POSTAL_ADDRESS || DEFAULT_ADDRESS).trim();
}
/** The footer added to automated emails. */
export async function complianceFooter(contactId: string) {
  const us = await company(); const addr = await postalAddress();
  return `\n\n--\n${[us.name, addr].filter(Boolean).join(", ")}\nYou received this because you met ${us.name} or asked about our products. To stop these emails: ${unsubPage(contactId)}`;
}
/** Headers that let Gmail and other inboxes show their own "Unsubscribe" button (one click). */
export function unsubHeaders(contactId: string): Record<string, string> {
  return { "List-Unsubscribe": `<${appUrl()}/api/public/unsubscribe/${unsubToken(contactId)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

/** Record the opt-out, stop every sequence, note it on the timeline and tell the owner. Safe to call twice. */
export async function unsubscribe(contactId: string, how: string) {
  const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, contactId)).limit(1);
  if (!c) return null;
  if (c.unsubscribedAt) return c;
  const now = new Date();
  await db.update(schema.contacts).set({ unsubscribedAt: now, updatedAt: now }).where(eq(schema.contacts.id, c.id));
  await db.update(schema.enrollments).set({ status: "stopped", stoppedReason: "Unsubscribed" })
    .where(and(eq(schema.enrollments.contactId, c.id), eq(schema.enrollments.status, "active")));
  await db.insert(schema.activities).values({ contactId: c.id, type: "note", subject: "Unsubscribed from emails", body: `${c.name} asked not to receive emails (${how}). Sequences were stopped and sending is blocked.`, byId: null, origin: "app" });
  if (c.ownerId) await addNotifications([{ userId: c.ownerId, kind: "unsubscribed", text: `${c.name} unsubscribed from emails`, link: `/contacts?id=${c.id}` }]);
  return { ...c, unsubscribedAt: now };
}
