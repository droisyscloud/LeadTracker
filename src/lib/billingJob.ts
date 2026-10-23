import { and, eq, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendInvoiceRequest, syncTask, billingSettings } from "./billing";
import { addNotifications } from "./notify";

/** Send invoice requests set to go automatically on their date (from the deal owner's mailbox). */
export async function runBilling() {
  const s = await billingSettings();
  if (!s.accountsEmails.length) return { skipped: "no accounts email" };
  const today = new Date().toLocaleDateString("en-CA");
  const due = await db.select().from(schema.billingItems).where(and(eq(schema.billingItems.autoSend, true), eq(schema.billingItems.status, "scheduled"), eq(schema.billingItems.kind, "invoice"), lte(schema.billingItems.dueDate, today)));
  let sent = 0;
  for (const it of due) {
    const [deal] = await db.select().from(schema.deals).where(eq(schema.deals.id, it.dealId)).limit(1);
    const senderId = deal?.ownerId || it.createdById; if (!senderId) continue;
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, senderId)).limit(1); if (!u) continue;
    try {
      const r = await sendInvoiceRequest(it, u); await syncTask(r.item, null); sent++;
      const who = [...new Set([senderId, it.assigneeId, ...it.watcherIds].filter(Boolean) as string[])];
      await addNotifications(who.map((userId) => ({ userId, kind: "task" as const, taskId: it.taskId, text: `Invoice request sent to accounts: ${it.label} (${deal?.name})`, link: `/billing?deal=${it.dealId}` })));
    } catch (e) { console.error("auto invoice request failed", it.id, e); }
  }
  return { due: due.length, sent };
}
