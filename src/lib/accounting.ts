import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "./audit";
import { syncTask } from "./billing";

/** One invoice as an accounting system reports it. */
export type ExtInvoice = { source: "quickbooks" | "import"; externalId: string; docNumber: string; customerName: string; amount: number; balance: number; currency?: string; txnDate: string | null; dueDate: string | null; paidOn: string | null };
const norm = (s: string) => s.toLowerCase().replace(/\b(inc|llc|ltd|corp|corporation|co|company|limited|pvt)\b\.?/g, "").replace(/[^a-z0-9]/g, "");
const today = () => new Date().toISOString().slice(0, 10);

/** Save what the accounting system reports, link each invoice to the app where it clearly matches, and update statuses. */
export async function ingest(list: ExtInvoice[]) {
  let linked = 0, updated = 0;
  const [items, deals, companies] = await Promise.all([db.select().from(schema.billingItems), db.select().from(schema.deals), db.select().from(schema.companies)]);
  const existing = list.length ? await db.select().from(schema.accountingInvoices).where(inArray(schema.accountingInvoices.externalId, list.map((x) => x.externalId))) : [];
  const taken = new Set((await db.select({ id: schema.accountingInvoices.localId }).from(schema.accountingInvoices)).map((x) => x.id).filter(Boolean) as string[]);
  for (const x of list) {
    const prev = existing.find((e) => e.source === x.source && e.externalId === x.externalId);
    let localType = prev?.localType ?? null, localId = prev?.localId ?? null;
    if (!localId && !prev?.ignored) {
      const num = x.docNumber.trim().toLowerCase();
      const byNum = num ? items.find((b) => b.invoiceNumber.trim().toLowerCase() === num && !taken.has(b.id)) : undefined;
      if (byNum) { localType = "billing"; localId = byNum.id; }
      else {
        const cn = norm(x.customerName);
        const cands = items.filter((b) => !taken.has(b.id) && b.kind === "invoice" && (b.status === "requested" || b.status === "invoiced") && !b.invoiceNumber && Math.abs(b.amount - x.amount) < 0.01
          && (() => { const d = deals.find((k) => k.id === b.dealId); const c = companies.find((k) => k.id === d?.companyId); const n = norm(c?.name || ""); return !!n && !!cn && (n.includes(cn) || cn.includes(n)); })());
        if (cands.length === 1) { localType = "billing"; localId = cands[0].id; }
      }
      if (localId) { taken.add(localId); linked++; }
    }
    const row = { ...x, currency: x.currency || "USD", localType, localId, updatedAt: new Date() };
    if (prev) await db.update(schema.accountingInvoices).set(row).where(eq(schema.accountingInvoices.id, prev.id));
    else await db.insert(schema.accountingInvoices).values(row);
    if (localId && localType) updated += await apply(localType, localId, x) ? 1 : 0;
  }
  return { received: list.length, linked, updated };
}

/** Bring one the app invoice in line with the accounting system (invoiced, then paid). */
export async function apply(localType: "billing", localId: string, x: Pick<ExtInvoice, "docNumber" | "txnDate" | "dueDate" | "balance" | "paidOn" | "amount">) {
  const paid = x.balance <= 0.005 && x.amount > 0;
  const [cur] = await db.select().from(schema.billingItems).where(eq(schema.billingItems.id, localId)).limit(1); if (!cur || cur.status === "cancelled") return false;
  const set: Partial<typeof schema.billingItems.$inferInsert> = { updatedAt: new Date() }; let changed = false;
  if (x.docNumber && cur.invoiceNumber !== x.docNumber) { set.invoiceNumber = x.docNumber; changed = true; }
  if (cur.status === "scheduled" || cur.status === "requested") { set.status = "invoiced"; set.invoicedOn = x.txnDate || today(); set.paymentDue = x.dueDate || cur.paymentDue; changed = true; }
  else if (cur.status === "invoiced" && x.dueDate && cur.paymentDue !== x.dueDate) { set.paymentDue = x.dueDate; changed = true; }
  if (paid && cur.status !== "paid") {
    const [p] = await db.insert(schema.dealPayments).values({ dealId: cur.dealId, amount: cur.amount, status: "received", date: x.paidOn || today(), note: `${cur.label} · invoice ${x.docNumber || cur.invoiceNumber} (from accounting)` }).returning();
    Object.assign(set, { status: "paid", paidOn: x.paidOn || today(), paymentId: p.id, invoicedOn: cur.invoicedOn || x.txnDate || today() }); changed = true;
  }
  if (!changed) return false;
  const [b] = await db.update(schema.billingItems).set(set).where(eq(schema.billingItems.id, cur.id)).returning();
  await syncTask(b, null);
  if (set.status && set.status !== cur.status) await audit(null, `billing.${set.status}`, "deal", cur.dealId, { label: cur.label, amount: cur.amount, via: "accounting" });
  return true;
}

/** Link an accounting invoice to a the app invoice by hand, and apply its status. */
export async function linkByHand(mirrorId: string, localType: "billing", localId: string) {
  const [m] = await db.update(schema.accountingInvoices).set({ localType, localId, ignored: false, updatedAt: new Date() }).where(eq(schema.accountingInvoices.id, mirrorId)).returning();
  if (m) await apply(localType, localId, { docNumber: m.docNumber, txnDate: m.txnDate, dueDate: m.dueDate, balance: m.balance, paidOn: m.paidOn, amount: m.amount });
  return m;
}
export const unmatched = () => db.select().from(schema.accountingInvoices).where(and(eq(schema.accountingInvoices.ignored, false))).then((r) => r.filter((x) => !x.localId));
