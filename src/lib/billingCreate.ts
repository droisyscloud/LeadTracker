import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { syncTask } from "./billing";

type NewItem = typeof schema.billingItems.$inferInsert & { status?: "scheduled" | "paid"; paidOn?: string | null };
/**
 * Add a billing line. A line marked paid records the money in the deal's payments straight away,
 * on its paid date (or its invoice date, or today), and its reminder is created already done.
 */
export async function createBillingItem(v: NewItem, actorId: string) {
  const paid = v.status === "paid" && v.kind !== "renewal";
  const paidOn = paid ? v.paidOn || v.dueDate || new Date().toLocaleDateString("en-CA") : null;
  const [row] = await db.insert(schema.billingItems).values({ ...v, status: paid ? "paid" : "scheduled", paidOn }).returning();
  let out = row;
  if (paid && row.amount > 0) {
    const [p] = await db.insert(schema.dealPayments).values({ dealId: row.dealId, amount: row.amount, status: "received", date: paidOn!, note: row.label, createdById: actorId }).returning();
    [out] = await db.update(schema.billingItems).set({ paymentId: p.id }).where(eq(schema.billingItems.id, row.id)).returning();
  }
  const taskId = await syncTask(out, actorId);
  return { ...out, taskId };
}
