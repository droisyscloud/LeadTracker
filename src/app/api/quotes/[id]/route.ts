import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { requireDealMoney } from "@/lib/payments";
import { quoteDTO, totals } from "@/lib/quotes";
import { audit } from "@/lib/audit";
import { quoteInput } from "../../deals/[id]/quotes/route";

type Ctx = { params: Promise<{ id: string }> };
async function load(id: string) { const [q] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, id)).limit(1); if (!q) throw new HttpError(404, "Quote not found."); return q; }
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser("rep"); const { id } = await params; const cur = await load(id); await requireDealMoney(me, cur.dealId);
  if (cur.status === "accepted") throw new HttpError(409, "This quote was accepted, so it can't be changed. Make a new one instead.");
  const d = await body(req, quoteInput.partial(), { patch: true }); const merged = { ...cur, ...d }; const t = totals(merged.lines, merged.discountPct, merged.taxRate);
  const [q] = await db.update(schema.quotes).set({ ...d, subtotal: t.subtotal, total: t.total, updatedAt: new Date() }).where(eq(schema.quotes.id, id)).returning();
  return ok(quoteDTO(q));
});
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser("rep"); const { id } = await params; const cur = await load(id); await requireDealMoney(me, cur.dealId);
  await db.delete(schema.quotes).where(eq(schema.quotes.id, id)); await audit(me.id, "quote.deleted", "deal", cur.dealId, { number: cur.number });
  return ok({ deleted: true });
});
