import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { requireDealMoney } from "@/lib/payments";
import { billingDTO } from "@/lib/billing";
import { createBillingItem } from "@/lib/billingCreate";
import { itemFields } from "@/lib/billingInput";
import { notify } from "@/lib/tasks";
import { requireCap } from "@/lib/permissions";

/** Save the reviewed billing schedule: each line becomes a billing item with its own reminder. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("rep"); await requireCap(me, "billing"); const { id } = await params;
  const [sow] = await db.select().from(schema.sows).where(eq(schema.sows.id, id)).limit(1);
  if (!sow) throw new HttpError(404, "SOW not found.");
  await requireDealMoney(me, sow.dealId);
  const d = await body(req, z.object({ items: z.array(itemFields).min(1).max(120) }));
  const out = [];
  for (const it of d.items) {
    const row = await createBillingItem({ ...it, dealId: sow.dealId, sowId: id, createdById: me.id }, me.id); const taskId = row.taskId;
    const people = [...new Set([it.assigneeId, ...it.watcherIds].filter((x): x is string => !!x && x !== me.id))];
    if (taskId && people.length && row.status !== "paid") await notify(people, { kind: it.assigneeId && it.assigneeId !== me.id ? "assigned" : "tagged", taskId, actor: me, text: `${me.name || me.email} added you to a billing reminder`, taskTitle: it.label, email: false }).catch(() => undefined);
    out.push(billingDTO(row));
  }
  return ok({ items: out }, 201);
});
