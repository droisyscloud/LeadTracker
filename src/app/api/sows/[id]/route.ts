import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { requireDealMoney } from "@/lib/payments";
import { sowDTO, syncRenewal } from "@/lib/billing";
import { requireCap } from "@/lib/permissions";

type Ctx = { params: Promise<{ id: string }> };
async function load(id: string) { const [s] = await db.select().from(schema.sows).where(eq(schema.sows.id, id)).limit(1); if (!s) throw new HttpError(404, "SOW not found."); return s; }
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser("rep"); await requireCap(me, "billing"); const { id } = await params; const cur = await load(id); await requireDealMoney(me, cur.dealId);
  const d = await body(req, z.object({ title: z.string().trim().max(200), value: z.number().nonnegative().nullable(), currency: z.string().max(8), startDate: z.string().nullable(), endDate: z.string().nullable(),
    poNumber: z.string().max(100), billingContact: z.string().max(300), netDays: z.number().int().min(0).max(365).nullable(), termsSummary: z.string().max(2000),
    sowNumber: z.string().trim().max(60), sowType: z.enum(["fixed", "milestone", "tm", "retainer", "other", ""]), signStatus: z.enum(["draft", "signed"]), active: z.boolean(), projectId: z.string().uuid().nullable() }).partial(), { patch: true });
  const [s] = await db.update(schema.sows).set(d).where(eq(schema.sows.id, id)).returning();
  if (d.endDate !== undefined && d.endDate !== cur.endDate) await syncRenewal(s, me.id);   // the renewal reminder follows the end date
  return ok(sowDTO(s));
});
/**
 * Remove a SOW. By default its billing lines that aren't paid yet are removed with it (and their reminders);
 * paid lines stay, because that money was received and is recorded in the deal's payments. Pass keep=all to keep
 * every line, or remove=all to also remove paid lines and the payments recorded from them.
 */
export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser("rep"); await requireCap(me, "billing"); const { id } = await params; const cur = await load(id); await requireDealMoney(me, cur.dealId);
  const q = new URL(req.url).searchParams; const keepAll = q.get("keep") === "all"; const removeAll = q.get("remove") === "all";
  const lines = await db.select().from(schema.billingItems).where(eq(schema.billingItems.sowId, id));
  const gone = keepAll ? [] : lines.filter((i) => removeAll || i.status !== "paid");
  const taskIds = gone.map((i) => i.taskId).filter(Boolean) as string[];
  const payIds = removeAll ? gone.map((i) => i.paymentId).filter(Boolean) as string[] : [];
  if (gone.length) await db.delete(schema.billingItems).where(inArray(schema.billingItems.id, gone.map((i) => i.id)));
  if (taskIds.length) await db.delete(schema.tasks).where(inArray(schema.tasks.id, taskIds));
  if (payIds.length) await db.delete(schema.dealPayments).where(inArray(schema.dealPayments.id, payIds));
  await db.delete(schema.sows).where(eq(schema.sows.id, id));
  return ok({ deleted: true, removedItems: gone.length, keptItems: lines.length - gone.length, removedPayments: payIds.length });
});
