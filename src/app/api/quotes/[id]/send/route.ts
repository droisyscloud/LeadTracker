import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { requireDealMoney } from "@/lib/payments";
import { quotePdf, quoteDTO } from "@/lib/quotes";
import { sendFollowUp } from "@/lib/mail";
import { mailConfigured } from "@/lib/config";
import { audit } from "@/lib/audit";

const appUrl = () => (process.env.APP_URL || process.env.AUTH_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/$/, "");
/** Email the quote (PDF plus a link to view and accept it online), and log it on the lead's timeline. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("rep"); const { id } = await params;
  const d = await body(req, z.object({ to: z.array(z.string().trim().toLowerCase().email()).min(1).max(10), subject: z.string().trim().min(1).max(300), text: z.string().trim().min(1).max(10000) }));
  if (!mailConfigured()) throw new HttpError(503, "Email isn't set up on the server yet.");
  const [q] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, id)).limit(1); if (!q) throw new HttpError(404, "Quote not found."); await requireDealMoney(me, q.dealId);
  const link = `${appUrl()}/q/${q.token}`; const text = `${d.text}\n\nView and accept the quote online: ${link}`;
  await sendFollowUp({ to: d.to.join(", "), subject: d.subject, text, sender: { name: me.name, email: me.email }, attachments: [{ filename: `Quote-${q.number}.pdf`, content: await quotePdf(q), contentType: "application/pdf" }] });
  const [row] = await db.update(schema.quotes).set({ status: q.status === "draft" ? "sent" : q.status, sentAt: q.sentAt || new Date(), sentTo: d.to, updatedAt: new Date() }).where(eq(schema.quotes.id, id)).returning();
  const [deal] = await db.select().from(schema.deals).where(eq(schema.deals.id, q.dealId)).limit(1);
  if (deal?.contactId) await db.insert(schema.activities).values({ contactId: deal.contactId, type: "email", subject: d.subject, body: text, byId: me.id, origin: "app", emailTo: d.to });
  await audit(me.id, "quote.sent", "deal", q.dealId, { number: q.number, to: d.to });
  return ok(quoteDTO(row));
});
