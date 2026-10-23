import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { audit } from "@/lib/audit";
import { requireBillingUser, sowFor } from "@/lib/collectionsAccess";
import { expenseInput } from "@/lib/collectionsInput";

type Ctx = { params: Promise<{ id: string }> };
async function load(id: string) { const [e] = await db.select().from(schema.sowExpenses).where(eq(schema.sowExpenses.id, id)).limit(1); if (!e) throw new HttpError(404, "Expense not found."); return e; }
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const me = await requireBillingUser(); const { id } = await params; const cur = await load(id); await sowFor(me, cur.sowId);
  const d = await body(req, expenseInput.omit({ sowId: true }).partial(), { patch: true });
  const [e] = await db.update(schema.sowExpenses).set(d).where(eq(schema.sowExpenses.id, id)).returning();
  await audit(me.id, "sow.expense.updated", "sow", cur.sowId, { name: e.name, changes: Object.keys(d) });
  return ok({ ...e, createdAt: e.createdAt.getTime() });
});
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireBillingUser(); const { id } = await params; const cur = await load(id); await sowFor(me, cur.sowId);
  await db.delete(schema.sowExpenses).where(eq(schema.sowExpenses.id, id));
  await audit(me.id, "sow.expense.deleted", "sow", cur.sowId, { name: cur.name });
  return ok({ deleted: true });
});
