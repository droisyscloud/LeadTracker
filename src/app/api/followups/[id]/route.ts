import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { audit } from "@/lib/audit";
import { addNotifications } from "@/lib/notify";
import { requireBillingUser, itemFor } from "@/lib/collectionsAccess";
import { followupInput } from "@/lib/collectionsInput";

type Ctx = { params: Promise<{ id: string }> };
async function load(id: string) { const [f] = await db.select().from(schema.collectionFollowups).where(eq(schema.collectionFollowups.id, id)).limit(1); if (!f) throw new HttpError(404, "Follow-up not found."); return f; }
const dto = (f: typeof schema.collectionFollowups.$inferSelect) => ({ ...f, createdAt: f.createdAt.getTime(), completedAt: f.completedAt?.getTime() ?? null });
/** Update a follow-up: record the outcome, a promise to pay, reassign, or mark it done. */
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const me = await requireBillingUser(); const { id } = await params; const cur = await load(id); const item = await itemFor(me, cur.billingItemId);
  const d = await body(req, followupInput.omit({ billingItemId: true }).partial(), { patch: true });
  const set: Partial<typeof schema.collectionFollowups.$inferInsert> = { ...d };
  if (d.status === "done" && cur.status !== "done") set.completedAt = new Date();
  if (d.status === "open") set.completedAt = null;
  const [f] = await db.update(schema.collectionFollowups).set(set).where(eq(schema.collectionFollowups.id, id)).returning();
  if (d.assigneeId && d.assigneeId !== cur.assigneeId && d.assigneeId !== me.id)
    await addNotifications([{ userId: d.assigneeId, kind: "task" as const, text: `${me.name || me.email} asked you to follow up on payment: ${item.label} (due ${f.dueDate})`, link: "/billing?tab=collections" }]);
  await audit(me.id, "followup.updated", "billing_item", item.id, { changes: Object.keys(d), outcome: f.outcome, promiseDate: f.promiseDate });
  return ok(dto(f));
});
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireBillingUser(); const { id } = await params; const cur = await load(id); await itemFor(me, cur.billingItemId);
  await db.delete(schema.collectionFollowups).where(eq(schema.collectionFollowups.id, id));
  await audit(me.id, "followup.deleted", "billing_item", cur.billingItemId, {});
  return ok({ deleted: true });
});
