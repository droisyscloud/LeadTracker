import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { totals } from "@/lib/quotes";
import { company } from "@/lib/brand";
import { QuoteActions } from "./QuoteActions";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };
const fmt = (n: number, cur: string) => { try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(n); } catch { return `${cur} ${n}`; } };
/** The client's view of a quote: read it, download it, accept or decline it. */
export default async function QuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const [q] = await db.select().from(schema.quotes).where(eq(schema.quotes.token, token)).limit(1); if (!q) notFound();
  const [deal] = await db.select().from(schema.deals).where(eq(schema.deals.id, q.dealId)).limit(1);
  const [co] = deal?.companyId ? await db.select().from(schema.companies).where(eq(schema.companies.id, deal.companyId)).limit(1) : [];
  const s = await company(); const t = totals(q.lines, q.discountPct, q.taxRate); const expired = !!q.validUntil && q.validUntil < new Date().toISOString().slice(0, 10);
  return <main className="quote-page"><article className="panel quote-doc">
    <header className="q-head"><img src="/api/public/brand/logo" alt={s.name} className="q-logo" /><div><b className="q-kind">QUOTE</b><div className="small muted">{q.number}{q.validUntil ? ` · valid until ${q.validUntil}` : ""}</div></div></header>
    <p className="small muted">Prepared for <b>{co?.name || deal?.name}</b> by {s.name}</p>
    {q.title && <h1 className="q-title">{q.title}</h1>}
    {q.intro && <p className="q-intro">{q.intro}</p>}
    <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Description</th><th className="n">Qty</th><th className="n">Unit price</th><th className="n">Amount</th></tr></thead>
      <tbody>{q.lines.map((l, i) => <tr key={i}><td>{l.description}</td><td className="n">{l.qty}</td><td className="n">{fmt(l.unitPrice, q.currency)}</td><td className="n"><b>{fmt(l.qty * l.unitPrice, q.currency)}</b></td></tr>)}</tbody></table></div>
    <div className="q-totals">{t.discount ? <div><span>Discount ({q.discountPct}%)</span><span>-{fmt(t.discount, q.currency)}</span></div> : null}<div><span>Subtotal</span><span>{fmt(t.subtotal, q.currency)}</span></div>
      {t.tax ? <div><span>Tax ({q.taxRate}%)</span><span>{fmt(t.tax, q.currency)}</span></div> : null}<div className="q-total"><span>Total</span><span>{fmt(t.total, q.currency)}</span></div></div>
    {q.terms && <><h3>Terms</h3><p className="small">{q.terms}</p></>}
    <QuoteActions token={token} status={q.status} expired={expired} respondedBy={q.respondedBy} />
  </article></main>;
}
