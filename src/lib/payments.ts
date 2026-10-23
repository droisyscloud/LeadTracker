import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Role } from "@/db/schema";
import { HttpError } from "./http";
import { canManage } from "./rbac";
import { requireDeal } from "./access";

/** Who may record money on a deal: the same people who may change it (its owner, or a manager). */
export async function requireDealMoney(me: { id: string; role: Role }, dealId: string) {
  await requireDeal(me, dealId);
  const [d] = await db.select().from(schema.deals).where(eq(schema.deals.id, dealId)).limit(1);
  if (!d) throw new HttpError(404, "Deal not found.");
  if (!canManage(me.role) && d.ownerId && d.ownerId !== me.id) throw new HttpError(403, "Only the deal's owner or a manager can record payments.");
  return d;
}
export const paymentDTO = (p: typeof schema.dealPayments.$inferSelect) => ({
  id: p.id, dealId: p.dealId, amount: p.amount, status: p.status, date: p.date, note: p.note, createdById: p.createdById, createdAt: p.createdAt.getTime(),
});
