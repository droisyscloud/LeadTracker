import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { complete, parseJson } from "./llm";
import { company, who } from "./brand";

/** What the AI needs to know about an unpaid invoice. */
export async function invoiceContext(itemId: string) {
  const [i] = await db.select().from(schema.billingItems).where(eq(schema.billingItems.id, itemId)).limit(1);
  const [d] = i ? await db.select().from(schema.deals).where(eq(schema.deals.id, i.dealId)).limit(1) : [];
  const [s] = i?.sowId ? await db.select().from(schema.sows).where(eq(schema.sows.id, i.sowId)).limit(1) : [];
  const [co] = d?.companyId ? await db.select().from(schema.companies).where(eq(schema.companies.id, d.companyId)).limit(1) : [];
  const [c] = d?.contactId ? await db.select().from(schema.contacts).where(eq(schema.contacts.id, d.contactId)).limit(1) : [];
  const fu = i ? await db.select().from(schema.collectionFollowups).where(eq(schema.collectionFollowups.billingItemId, i.id)) : [];
  const due = i?.paymentDue || i?.dueDate || null;
  const daysLate = due ? Math.floor((Date.now() - new Date(`${due}T12:00:00`).getTime()) / 86400_000) : 0;
  const billingEmail = (s?.billingContact.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0] || c?.email || "";
  return { item: i, deal: d, sow: s, company: co, contact: c, followups: fu, due, daysLate, billingEmail, currency: s?.currency || "USD" };
}
export async function reminderDraft(itemId: string, senderName: string) {
  const x = await invoiceContext(itemId);
  const tone = x.daysLate > 45 ? "firm and direct (seriously overdue), still professional" : x.daysLate > 14 ? "clear and a little firmer (overdue)" : x.daysLate > 0 ? "friendly but clear (just overdue)" : "friendly and light (a heads-up before it's due)";
  const us = await company();
  const prompt = `Write a short payment reminder email from ${senderName} at ${us.name} to ${x.contact?.name || "the accounts payable team"} at ${x.company?.name || "the client"}.
Invoice: ${x.item?.label}${x.item?.invoiceNumber ? `, invoice number ${x.item.invoiceNumber}` : ""}, amount ${x.currency} ${x.item?.amount?.toLocaleString("en-US")}${x.sow?.poNumber ? `, PO ${x.sow.poNumber}` : ""}.
Payment due: ${x.due || "not set"}${x.daysLate > 0 ? ` (${x.daysLate} days overdue)` : ""}.
Earlier follow-ups: ${x.followups.filter((f) => f.notes || f.outcome).map((f) => `${f.dueDate}: ${f.outcome || "-"} ${f.notes}`).join(" | ") || "none"}.
Tone: ${tone}. Ask them to confirm the payment date, offer to resend the invoice, and keep it under 120 words. Plain text, no placeholders in square brackets.
Reply ONLY with JSON: {"subject": "...", "body": "..."}`;
  const j = parseJson<{ subject?: string; body?: string }>(await complete({ prompt, maxTokens: 500 }), "{");
  return { to: x.billingEmail, subject: String(j.subject || `Payment for ${x.item?.label}`), body: String(j.body || "") };
}
export async function parseNote(itemId: string, text: string) {
  const x = await invoiceContext(itemId); const today = new Date().toISOString().slice(0, 10);
  const us = await company();
  const prompt = `Today is ${today}. A ${us.name} team member followed up with a client about an unpaid invoice of ${x.currency} ${x.item?.amount} (${x.item?.label}). Their note: """${text.slice(0, 2000)}"""
Work out: outcome (one of: no_answer, left_message, promised, disputed, paid, other), promiseDate (YYYY-MM-DD if the client promised to pay by a date, else null), promiseAmount (number if stated, else null; "half" means half of the amount),
type (call, email, meeting or other), nextDate (YYYY-MM-DD for the next follow-up: the day after a promise date, or in 3 working days if nothing was promised), and a one-line summary.
Reply ONLY with JSON: {"outcome": "...", "promiseDate": null, "promiseAmount": null, "type": "...", "nextDate": "...", "summary": "..."}`;
  const j = parseJson<Record<string, unknown>>(await complete({ prompt, maxTokens: 300 }), "{");
  const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const outcomes = ["no_answer", "left_message", "promised", "disputed", "paid", "other"];
  return { outcome: outcomes.includes(String(j.outcome)) ? String(j.outcome) : "other", promiseDate: day(j.promiseDate), promiseAmount: typeof j.promiseAmount === "number" ? j.promiseAmount : null,
    type: ["call", "email", "meeting", "other"].includes(String(j.type)) ? String(j.type) : "call", nextDate: day(j.nextDate), summary: String(j.summary || text).slice(0, 500) };
}
