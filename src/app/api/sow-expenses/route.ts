import { db, schema } from "@/db";
import { body, ok, route } from "@/lib/http";
import { audit } from "@/lib/audit";
import { requireBillingUser, sowFor } from "@/lib/collectionsAccess";
import { expenseInput } from "@/lib/collectionsInput";

export const POST = route(async (req: Request) => {
  const me = await requireBillingUser(); const d = await body(req, expenseInput); await sowFor(me, d.sowId);
  const [e] = await db.insert(schema.sowExpenses).values({ ...d, createdById: me.id }).returning();
  await audit(me.id, "sow.expense.created", "sow", d.sowId, { name: e.name, planned: e.planned });
  return ok({ ...e, createdAt: e.createdAt.getTime() }, 201);
});
