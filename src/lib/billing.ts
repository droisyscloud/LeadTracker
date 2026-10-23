import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { complete, parseJson } from "./llm";
import { getState } from "./jobstate";
import { getFile } from "./storage";
import { sendAsUser } from "./sendmail";
import { appUrl } from "./config";
import { company, who } from "./brand";

export type DraftItem = { label: string; percent: number | null; amount: number; dueDate: string | null; trigger: string; kind: "invoice" | "renewal" };
export type SowRead = { title: string; value: number | null; currency: string; startDate: string | null; endDate: string | null; poNumber: string; billingContact: string; sowNumber?: string; sowType?: string; endDateSource?: string;
  netDays: number | null; summary: string; items: DraftItem[]; warnings: string[] };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const addMonths = (d: string, n: number) => { const [y, m, day] = d.split("-").map(Number); const last = new Date(y, m - 1 + n + 1, 0).getDate(); const t = new Date(y, m - 1 + n, Math.min(day, last)); return t.toLocaleDateString("en-CA"); };
export const addDays = (d: string, n: number) => { const t = new Date(`${d}T12:00:00`); t.setDate(t.getDate() + n); return t.toLocaleDateString("en-CA"); };

/**
 * AI reads a SOW and returns the contract basics and its billing schedule. Monthly or recurring payments are
 * expanded into one line per invoice; amounts are worked out from percentages when only a percentage is given;
 * anything the SOW leaves undated (like "on UAT sign-off") comes back without a date and is flagged.
 */
export async function readSow(text: string, deal: { name: string; value: number; currency: string }, today: string): Promise<SowRead> {
  const us = await company();
  const prompt = `You read a signed Statement of Work (SOW) for ${who(us)}, and extract its commercial and payment terms.

Deal in our system: "${deal.name}", value ${deal.currency} ${deal.value}. Today is ${today}.

Return only JSON with this shape:
{"title": "short name of the SOW or project", "value": total contract value as a number or null, "currency": "ISO code, e.g. USD", "startDate": "YYYY-MM-DD" or null, "endDate": "YYYY-MM-DD" or null, "endDateSource": "the exact sentence or phrase in the SOW that gives the end date or term, copied word for word, else empty",
 "poNumber": "" , "sowNumber": "the SOW's own number or reference if written on it, else empty", "sowType": "one of fixed, milestone, tm (time and materials), retainer, other, or empty", "billingContact": "name and/or email of the customer's billing or accounts payable contact, or empty", "netDays": payment due days after invoice (e.g. 30 for Net 30) or null,
 "summary": "two or three plain sentences on the payment terms",
 "schedule": [{"label": "e.g. Advance on signing (40%)", "percent": number or null, "amount": number or null, "dueDate": "YYYY-MM-DD" or null, "trigger": "what makes it due, e.g. on signing, on UAT sign-off, monthly",
   "recurring": null or {"every": "month" | "quarter", "count": number of invoices, "startDate": "YYYY-MM-DD"}}],
 "warnings": ["anything unclear, missing or unusual, in plain words"]}

Rules: use only what the document says; never invent amounts or dates. If a payment is due "on signing" use the start date (or the signing date) when stated.
If a payment depends on an event with no date (a milestone, acceptance), give dueDate null and say so in trigger. For monthly fees, use one schedule line with "recurring".
Percentages are of the total contract value. Include late-payment fees, retainers, or expenses billing in summary or warnings.

SOW text:
"""
${text.slice(0, 60000)}
"""`;
  const j = parseJson<Record<string, unknown>>(await complete({ prompt, maxTokens: 2500 }), "{");
  const value = typeof j.value === "number" && j.value > 0 ? j.value : null;
  const total = value ?? (deal.value || 0);
  const warnings: string[] = Array.isArray(j.warnings) ? (j.warnings as unknown[]).map(String).filter(Boolean).slice(0, 10) : [];
  const items: DraftItem[] = [];
  for (const raw of (Array.isArray(j.schedule) ? j.schedule : []) as Record<string, unknown>[]) {
    const pct = typeof raw.percent === "number" ? raw.percent : null;
    const amt = typeof raw.amount === "number" ? raw.amount : null;
    const due = typeof raw.dueDate === "string" && ISO.test(raw.dueDate) ? raw.dueDate : null;
    const rec = raw.recurring as { every?: string; count?: number; startDate?: string } | null;
    const label = String(raw.label || "Invoice").slice(0, 200); const trigger = String(raw.trigger || "").slice(0, 300);
    if (rec && (rec.every === "month" || rec.every === "quarter") && typeof rec.count === "number" && rec.count > 0) {
      const n = Math.min(60, Math.round(rec.count)); const start = typeof rec.startDate === "string" && ISO.test(rec.startDate) ? rec.startDate : due;
      const each = amt ?? (pct !== null ? (total * pct) / 100 : 0);
      for (let i = 0; i < n; i++) items.push({ label: `${label} (${i + 1} of ${n})`, percent: pct, amount: Math.round(each * 100) / 100, dueDate: start ? addMonths(start, i * (rec.every === "quarter" ? 3 : 1)) : null, trigger, kind: "invoice" });
      continue;
    }
    items.push({ label, percent: pct, amount: Math.round((amt ?? (pct !== null ? (total * pct) / 100 : 0)) * 100) / 100, dueDate: due, trigger, kind: "invoice" });
  }
  const sum = items.reduce((n, i) => n + i.amount, 0);
  if (value && items.length && Math.abs(sum - value) > Math.max(1, value * 0.01)) warnings.push(`The schedule adds up to ${Math.round(sum).toLocaleString()} but the contract value is ${Math.round(value).toLocaleString()}. Check the amounts.`);
  const undated = items.filter((i) => !i.dueDate).length;
  if (undated) warnings.push(`${undated} payment${undated === 1 ? " has" : "s have"} no fixed date in the SOW (for example a milestone). Set ${undated === 1 ? "a date" : "dates"} before saving so reminders go out.`);
  const endDate = typeof j.endDate === "string" && ISO.test(j.endDate) ? j.endDate : null;
  // an end date far beyond the last payment is often a misreading: say so, with where it came from
  const lastDue = items.filter((i) => i.kind === "invoice" && i.dueDate).map((i) => i.dueDate as string).sort().pop();
  if (endDate && lastDue && endDate > addDays(lastDue, 120)) warnings.push(`The end date (${endDate}) is more than 4 months after the last payment (${lastDue}). Check it against the SOW${typeof j.endDateSource === "string" && j.endDateSource ? `: "${String(j.endDateSource).slice(0, 200)}"` : "."}`);
  if (endDate) items.push({ label: "Renewal conversation (SOW ends " + endDate + ")", percent: null, amount: 0, dueDate: addDays(endDate, -60) < today ? today : addDays(endDate, -60), trigger: "60 days before the SOW ends", kind: "renewal" });
  return {
    title: String(j.title || "").slice(0, 200), value, currency: String(j.currency || deal.currency || "USD").slice(0, 8).toUpperCase(),
    startDate: typeof j.startDate === "string" && ISO.test(j.startDate) ? j.startDate : null, endDate,
    poNumber: String(j.poNumber || "").slice(0, 100), billingContact: String(j.billingContact || "").slice(0, 300),
    endDateSource: String(j.endDateSource || "").slice(0, 400), sowNumber: String(j.sowNumber || "").slice(0, 60), sowType: ["fixed", "milestone", "tm", "retainer", "other"].includes(String(j.sowType)) ? String(j.sowType) : "",
    netDays: typeof j.netDays === "number" && j.netDays >= 0 && j.netDays <= 365 ? Math.round(j.netDays) : null,
    summary: String(j.summary || "").slice(0, 2000), items, warnings,
  };
}

export type BillingSettings = { accountsEmails: string[]; cc: string[] };
export async function billingSettings(): Promise<BillingSettings> {
  const s = (await getState("billing")) as Partial<BillingSettings> | null;
  const env = (process.env.ACCOUNTS_EMAILS || "").split(",").map((x) => x.trim()).filter(Boolean);
  return { accountsEmails: s?.accountsEmails?.length ? s.accountsEmails : env, cc: s?.cc || [] };
}

type Item = typeof schema.billingItems.$inferSelect;
/** The task that reminds people about an invoice: title, date and people follow the billing item. */
export async function syncTask(item: Item, actorId: string | null) {
  const [deal] = await db.select().from(schema.deals).where(eq(schema.deals.id, item.dealId)).limit(1);
  if (!deal) return null;
  const waiting = item.status === "invoiced";
  const title = item.kind === "renewal" ? `${item.label}: ${deal.name}` : waiting ? `Payment due: ${item.label} (${deal.name})` : `Invoice due: ${item.label} (${deal.name})`;
  const due = waiting ? item.paymentDue || item.dueDate : item.dueDate;
  const done = item.status === "paid" || item.status === "cancelled" || (item.kind === "renewal" && item.status !== "scheduled");
  const fields = { title: title.slice(0, 300), dueDate: due, assigneeId: item.assigneeId, contactId: deal.contactId, companyId: deal.companyId, dealId: deal.id,
    done, status: done ? "done" as const : "todo" as const, notes: [item.trigger && `Due when: ${item.trigger}`, item.amount ? `Amount: ${deal.currency} ${item.amount.toLocaleString()}` : "", item.note, `Billing: ${appUrl()}/billing?deal=${deal.id}`].filter(Boolean).join("\n") };
  let taskId = item.taskId;
  if (taskId) await db.update(schema.tasks).set({ ...fields, updatedAt: new Date() }).where(eq(schema.tasks.id, taskId));
  else { const [t] = await db.insert(schema.tasks).values({ ...fields, createdById: actorId, priority: "high" }).returning(); taskId = t.id; await db.update(schema.billingItems).set({ taskId }).where(eq(schema.billingItems.id, item.id)); }
  await db.delete(schema.taskWatchers).where(eq(schema.taskWatchers.taskId, taskId!));
  const watchers = item.watcherIds.filter((w) => w && w !== item.assigneeId);
  if (watchers.length) await db.insert(schema.taskWatchers).values(watchers.map((userId) => ({ taskId: taskId!, userId }))).onConflictDoNothing();
  return taskId;
}

/** The email asking the accounts team to raise an invoice. */
export async function invoiceRequest(item: Item) {
  const [deal] = await db.select().from(schema.deals).where(eq(schema.deals.id, item.dealId)).limit(1);
  const [sow] = item.sowId ? await db.select().from(schema.sows).where(eq(schema.sows.id, item.sowId)).limit(1) : [];
  const [co] = deal?.companyId ? await db.select().from(schema.companies).where(eq(schema.companies.id, deal.companyId)).limit(1) : [];
  const [lead] = deal?.contactId ? await db.select().from(schema.contacts).where(eq(schema.contacts.id, deal.contactId)).limit(1) : [];
  const cur = sow?.currency || deal?.currency || "USD";
  const when = item.dueDate ? new Date(`${item.dueDate}T12:00:00`).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }) : "as soon as possible";
  const subject = `Invoice request: ${co?.name || deal?.name} · ${item.label} · ${cur} ${item.amount.toLocaleString("en-US")}`;
  const lines = [
    "Hi Accounts team,", "",
    `Please raise an invoice to ${co?.name || "the customer"} on ${when}.`, "",
    `Customer: ${co?.name || "—"}`,
    `Project / deal: ${deal?.name || "—"}`,
    sow?.title ? `SOW: ${sow.title}` : "",
    `Billing item: ${item.label}`,
    `Amount: ${cur} ${item.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${item.percent ? ` (${item.percent}% of the contract)` : ""}`,
    sow?.poNumber ? `PO number: ${sow.poNumber}` : "",
    sow?.netDays !== null && sow?.netDays !== undefined ? `Payment terms: Net ${sow.netDays}` : "",
    sow?.billingContact ? `Customer billing contact: ${sow.billingContact}` : lead?.email ? `Customer contact: ${lead.name} <${lead.email}>` : "",
    item.trigger ? `Due when: ${item.trigger}` : "",
    item.note ? `Notes: ${item.note}` : "", "",
    sow ? "The signed SOW is attached." : "",
    "Please reply with the invoice number once it's raised, so we can track payment.", "",
    "Thank you",
  ].filter((l, i, a) => l !== "" || (a[i - 1] !== "" && i > 0));
  let attachments: { filename: string; content: Buffer; contentType: string }[] = [];
  if (sow?.fileId) {
    const [f] = await db.select().from(schema.files).where(eq(schema.files.id, sow.fileId)).limit(1);
    if (f) try { attachments = [{ filename: f.name, content: await getFile(f.storageKey), contentType: f.contentType }]; } catch { /* send without it */ }
  }
  return { subject, text: lines.join("\n"), attachments };
}

/** Send the request from a person's own mailbox (or the shared one), and record it. */
export async function sendInvoiceRequest(item: Item, sender: { id: string; name: string | null; email: string }, override?: { to?: string[]; text?: string }) {
  // who sent it and where it went are kept on the billing line (see its details)
  const s = await billingSettings();
  const to = override?.to?.length ? override.to : s.accountsEmails;
  if (!to.length) throw new Error("no-accounts-email");
  const mail = await invoiceRequest(item);
  await sendAsUser(sender as Parameters<typeof sendAsUser>[0], { to: [...to, ...s.cc].join(", "), subject: mail.subject, text: override?.text || mail.text, attachments: mail.attachments });
  const [u] = await db.update(schema.billingItems).set({ status: item.status === "scheduled" ? "requested" : item.status, requestedAt: new Date(), requestedById: sender.id, requestedTo: [...to, ...s.cc], updatedAt: new Date() }).where(eq(schema.billingItems.id, item.id)).returning();
  return { item: u, to };
}

export const billingDTO = (b: Item) => ({ ...b, createdAt: b.createdAt.getTime(), updatedAt: b.updatedAt.getTime(), requestedAt: b.requestedAt?.getTime() ?? null });
export const sowDTO = (s: typeof schema.sows.$inferSelect) => ({ id: s.id, dealId: s.dealId, fileId: s.fileId, title: s.title, value: s.value, currency: s.currency, startDate: s.startDate, endDate: s.endDate,
  poNumber: s.poNumber, billingContact: s.billingContact, netDays: s.netDays, termsSummary: s.termsSummary, createdAt: s.createdAt.getTime(),
  sowNumber: s.sowNumber, sowType: s.sowType, signStatus: s.signStatus, active: s.active, projectId: s.projectId, endDateSource: String((s.extracted as { endDateSource?: string } | null)?.endDateSource || "") });
export async function billingForDeals(dealIds: string[]) {
  if (!dealIds.length) return { sows: [], items: [], expenses: [], followups: [], projects: [] };
  const [sw, it, pr] = await Promise.all([db.select().from(schema.sows).where(inArray(schema.sows.dealId, dealIds)), db.select().from(schema.billingItems).where(inArray(schema.billingItems.dealId, dealIds)),
    db.select().from(schema.projects)]);
  const [ex, fu] = await Promise.all([sw.length ? db.select().from(schema.sowExpenses).where(inArray(schema.sowExpenses.sowId, sw.map((s) => s.id))) : [],
    it.length ? db.select().from(schema.collectionFollowups).where(inArray(schema.collectionFollowups.billingItemId, it.map((x) => x.id))) : []]);
  return { sows: sw.map(sowDTO), items: it.map(billingDTO),
    expenses: ex.map((e) => ({ ...e, createdAt: e.createdAt.getTime() })),
    followups: fu.map((f) => ({ ...f, createdAt: f.createdAt.getTime(), completedAt: f.completedAt?.getTime() ?? null })),
    projects: pr.map((p) => ({ ...p, createdAt: p.createdAt.getTime() })) };
}

/** Keep the SOW's renewal reminder in step with its end date (60 days before, or today if that's passed). */
export async function syncRenewal(sow: typeof schema.sows.$inferSelect, actorId: string | null) {
  const today = new Date().toISOString().slice(0, 10);
  const existing = (await db.select().from(schema.billingItems).where(eq(schema.billingItems.sowId, sow.id))).filter((i) => i.kind === "renewal" && i.status === "scheduled");
  if (!sow.endDate) { for (const r of existing) { const [x] = await db.update(schema.billingItems).set({ status: "cancelled", updatedAt: new Date() }).where(eq(schema.billingItems.id, r.id)).returning(); await syncTask(x, actorId); } return; }
  const due = addDays(sow.endDate, -60) < today ? today : addDays(sow.endDate, -60); const label = `Renewal conversation (SOW ends ${sow.endDate})`;
  if (existing.length) { for (const r of existing) { const [x] = await db.update(schema.billingItems).set({ label, dueDate: due, updatedAt: new Date() }).where(eq(schema.billingItems.id, r.id)).returning(); await syncTask(x, actorId); } return; }
  const [x] = await db.insert(schema.billingItems).values({ dealId: sow.dealId, sowId: sow.id, label, amount: 0, dueDate: due, trigger: "60 days before the SOW ends", kind: "renewal", createdById: actorId }).returning();
  await syncTask(x, actorId);
}
