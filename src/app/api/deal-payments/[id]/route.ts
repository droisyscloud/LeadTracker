import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { paymentDTO, requireDealMoney } from "@/lib/payments";
import { audit } from "@/lib/audit";
import { requireCap } from "@/lib/permissions";

type Ctx = { params: Promise<{ id: string }> };
async function load(id: string) {
  const [p] = await db.select().from(schema.dealPayments).where(eq(schema.dealPayments.id, id)).limit(1);
  if (!p) throw new HttpError(404, "Payment not found.");
  return p;
}
/** Change a payment, or mark an expected payment as received. */
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser("rep"); await requireCap(me, "billing");
  const { id } = await params; const cur = await load(id);
  await requireDealMoney(me, cur.dealId);
  const d = await body(req, z.object({ amount: z.number().positive().max(1e12), status: z.enum(["received", "expected"]), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().trim().max(500) }).partial(), { patch: true });
  const [p] = await db.update(schema.dealPayments).set({ ...d, updatedAt: new Date() }).where(eq(schema.dealPayments.id, id)).returning();
  await audit(me.id, d.status === "received" && cur.status === "expected" ? "payment.received" : "payment.updated", "deal", cur.dealId, { amount: p.amount, date: p.date });
  return ok(paymentDTO(p));
});
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser("rep"); await requireCap(me, "billing");
  const { id } = await params; const cur = await load(id);
  await requireDealMoney(me, cur.dealId);
  await db.delete(schema.dealPayments).where(eq(schema.dealPayments.id, id));
  await audit(me.id, "payment.deleted", "deal", cur.dealId, { amount: cur.amount, date: cur.date });
  return ok({ deleted: true });
});
