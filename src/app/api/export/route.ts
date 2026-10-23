import { db, schema } from "@/db";
import { route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor, requireCompany, requireContact, requireDeal, requireTask } from "@/lib/access";
import { audit } from "@/lib/audit";
import { requireCap } from "@/lib/permissions";
import { canReadEmail, redactEmail } from "@/lib/emailPrivacy";

const STAGE: Record<string, string> = { new: "New lead", contacted: "Contacted", engaged: "Engaged", meeting: "Meeting set", proposal: "Proposal sent", won: "Won", lost: "Not now" };
const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export const GET = route(async () => {
  const me = await requireUser("rep"); await requireCap(me, "export");
  const [contacts, companies, users, products, cps, acts] = await Promise.all([
    db.select().from(schema.contacts), db.select().from(schema.companies), db.select().from(schema.users),
    db.select().from(schema.products), db.select().from(schema.contactProducts), db.select().from(schema.activities),
  ]);
  // other people's emails are exported without content (only that they happened)
  const actsPrivate = acts.map((a) => (canReadEmail(a, me.id) ? a : redactEmail(a)));
  const acc = await accessFor(me);
  const visible = contacts.filter((c) => acc.canSeeContact(c.id));
  contacts.length = 0; contacts.push(...visible);
  const co = new Map(companies.map((c) => [c.id, c])), us = new Map(users.map((u) => [u.id, u])), pr = new Map(products.map((p) => [p.id, p.name]));
  const prodBy = new Map<string, string[]>(); for (const x of cps) prodBy.set(x.contactId, [...(prodBy.get(x.contactId) || []), pr.get(x.productId) || ""]);
  const st = new Map<string, Record<string, number>>();
  for (const a of actsPrivate) { const s = st.get(a.contactId) || {}; s[a.type] = (s[a.type] || 0) + 1; if (a.openedAt) s.opened = (s.opened || 0) + 1; st.set(a.contactId, s); }
  const head = ["Name", "Title", "Company", "Website", "Email", "Phone", "Stage", "Owner", "Rating", "Next follow-up", "Tags", "Products", "Emails", "Opened", "Replies", "Calls", "Requests", "Last touch", "Source", "Added"];
  const rows = contacts.map((c) => { const s = st.get(c.id) || {}; const company = c.companyId ? co.get(c.companyId) : undefined;
    return [c.name, c.title, company?.name, company?.website, c.email, c.phone, STAGE[c.status], c.ownerId ? (us.get(c.ownerId)?.name || us.get(c.ownerId)?.email) : "",
      c.rating || "", c.nextFollowUp, c.tags.join("; "), (prodBy.get(c.id) || []).join("; "), s.email || 0, s.opened || 0, s.reply || 0, s.call || 0, s.request || 0,
      c.lastTouchAt?.toISOString().slice(0, 10), c.source, c.createdAt.toISOString().slice(0, 10)].map(esc).join(","); });
  await audit(me.id, "export.csv", "contacts", null, { rows: rows.length });
  return new Response([head.join(","), ...rows].join("\n"), { headers: {
    "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
  } });
});
