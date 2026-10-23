import { db, schema } from "@/db";
import { body, ok, route } from "@/lib/http";
import { audit } from "@/lib/audit";
import { addNotifications } from "@/lib/notify";
import { requireBillingUser, itemFor } from "@/lib/collectionsAccess";
import { followupInput } from "@/lib/collectionsInput";

/** Add a collections follow-up to an invoice; the person it's assigned to is told. */
export const POST = route(async (req: Request) => {
  const me = await requireBillingUser(); const d = await body(req, followupInput); const item = await itemFor(me, d.billingItemId);
  const assigneeId = d.assigneeId ?? me.id;
  const [f] = await db.insert(schema.collectionFollowups).values({ ...d, assigneeId, completedAt: d.status === "done" ? new Date() : null, createdById: me.id }).returning();
  if (assigneeId !== me.id) await addNotifications([{ userId: assigneeId, kind: "task" as const, text: `${me.name || me.email} asked you to follow up on payment: ${item.label} (due ${d.dueDate})`, link: "/billing?tab=collections" }]);
  await audit(me.id, "followup.created", "billing_item", item.id, { due: d.dueDate, type: d.type, assigneeId });
  return ok({ ...f, createdAt: f.createdAt.getTime(), completedAt: f.completedAt?.getTime() ?? null }, 201);
});
