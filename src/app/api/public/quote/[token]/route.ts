import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { addNotifications } from "@/lib/notify";
import { audit } from "@/lib/audit";

/** The client opened, accepted or declined the quote (no sign-in: the private link is the key). */
export const POST = route(async (req: Request, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params; const d = await body(req, z.object({ action: z.enum(["view", "accept", "decline"]), name: z.string().trim().max(120).default("") }));
  const [q] = await db.select().from(schema.quotes).where(eq(schema.quotes.token, token)).limit(1); if (!q) throw new HttpError(404, "This quote link isn't valid.");
  const [deal] = await db.select().from(schema.deals).where(eq(schema.deals.id, q.dealId)).limit(1);
  const [co] = deal?.companyId ? await db.select().from(schema.companies).where(eq(schema.companies.id, deal.companyId)).limit(1) : [];
  const who = co?.name || deal?.name || "The client"; const to = [...new Set([deal?.ownerId, q.createdById].filter(Boolean) as string[])];
  const tell = (text: string) => addNotifications(to.map((userId) => ({ userId, kind: "reply" as const, text, link: `/deals?id=${q.dealId}` })));
  if (d.action === "view") {
    const first = !q.firstViewedAt;
    await db.update(schema.quotes).set({ views: q.views + 1, firstViewedAt: q.firstViewedAt || new Date(), status: q.status === "sent" ? "viewed" : q.status }).where(eq(schema.quotes.id, q.id));
    if (first) await tell(`${who} opened your quote ${q.number}`);
    return ok({ status: q.status === "sent" ? "viewed" : q.status });
  }
  if (q.status === "accepted" || q.status === "declined") throw new HttpError(409, `This quote was already ${q.status}.`);
  if (d.action === "accept" && q.validUntil && q.validUntil < new Date().toISOString().slice(0, 10)) throw new HttpError(410, "This quote has expired. Please ask for an updated one.");
  const status = d.action === "accept" ? "accepted" : "declined";
  await db.update(schema.quotes).set({ status, respondedAt: new Date(), respondedBy: d.name }).where(eq(schema.quotes.id, q.id));
  await tell(`${who} ${status} your quote ${q.number}${d.name ? ` (${d.name})` : ""}`);
  if (deal?.contactId) await db.insert(schema.activities).values({ contactId: deal.contactId, type: "note", subject: `Quote ${q.number} ${status}`, body: `${d.name || who} ${status} quote ${q.number} online.`, origin: "app" });
  await audit(null, `quote.${status}`, "deal", q.dealId, { number: q.number, by: d.name });
  return ok({ status });
});
