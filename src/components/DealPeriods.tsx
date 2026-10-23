"use client";
import type { DealDTO, PaymentDTO } from "@/lib/types";
import { isOpenDeal, moneyShort } from "./model";
import { bucket } from "./periods";

/**
 * Deals grouped by month, quarter or year of their close date: won (count and value), lost, win rate,
 * and what's still open, with a bar showing won value against the best period.
 */
export function DealPeriods({ deals, by, onBy, payments = [] }: { deals: DealDTO[]; by: "month" | "quarter" | "year"; onBy: (b: "month" | "quarter" | "year") => void; payments?: PaymentDTO[] }) {
  const rows = new Map<string, { label: string; won: number; wonN: number; lostN: number; open: number; openN: number; got: number }>();
  for (const p of payments) { if (p.status !== "received") continue; const [k, label] = bucket(p.date, by); const r = rows.get(k) || { label, won: 0, wonN: 0, lostN: 0, open: 0, openN: 0, got: 0 }; r.got += p.amount; rows.set(k, r); }
  for (const d of deals) {
    if (!d.closeDate) continue;
    const [k, label] = bucket(d.closeDate, by);
    const r = rows.get(k) || { label, won: 0, wonN: 0, lostN: 0, open: 0, openN: 0, got: 0 };
    if (d.stage === "won") { r.won += d.value; r.wonN++; } else if (d.stage === "lost") r.lostN++; else if (isOpenDeal(d)) { r.open += d.value; r.openN++; }
    rows.set(k, r);
  }
  const list = [...rows.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const max = Math.max(1, ...list.map(([, r]) => r.won));
  const undated = deals.filter((d) => !d.closeDate).length;
  const tot = list.reduce((t, [, r]) => ({ won: t.won + r.won, wonN: t.wonN + r.wonN, lostN: t.lostN + r.lostN, open: t.open + r.open, got: t.got + r.got }), { won: 0, wonN: 0, lostN: 0, open: 0, got: 0 });
  return <section className="panel dperiods">
    <div className="sec-h"><h3>Closed by {by}</h3>
      <div className="vt" role="group" aria-label="Group by">{(["month", "quarter", "year"] as const).map((b) => <button key={b} type="button" aria-pressed={by === b} onClick={() => onBy(b)}>{b[0].toUpperCase() + b.slice(1)}</button>)}</div></div>
    {list.length ? <div className="tbl-wrap"><table className="tbl dp-tbl"><thead><tr><th>{by[0].toUpperCase() + by.slice(1)}</th><th>Won</th><th className="n">Won value</th><th className="n">Lost</th><th className="n">Win rate</th><th className="n">Still open</th><th className="n">Received</th></tr></thead>
      <tbody>{list.map(([k, r]) => { const closed = r.wonN + r.lostN; return <tr key={k}>
        <td><b>{r.label}</b></td>
        <td className="dp-bar"><span><i style={{ width: `${(r.won / max) * 100}%` }} /></span><small>{r.wonN} deal{r.wonN === 1 ? "" : "s"}</small></td>
        <td className="n num won">{r.won ? moneyShort(r.won) : "—"}</td><td className="n">{r.lostN || "—"}</td>
        <td className="n">{closed ? `${Math.round((r.wonN / closed) * 100)}%` : "—"}</td><td className="n num">{r.open ? `${moneyShort(r.open)} (${r.openN})` : "—"}</td><td className="n num">{r.got ? moneyShort(r.got) : "—"}</td></tr>; })}</tbody>
      <tfoot><tr><td><b>Total</b></td><td>{tot.wonN} won</td><td className="n num won"><b>{moneyShort(tot.won)}</b></td><td className="n">{tot.lostN}</td>
        <td className="n">{tot.wonN + tot.lostN ? `${Math.round((tot.wonN / (tot.wonN + tot.lostN)) * 100)}%` : "—"}</td><td className="n num">{tot.open ? moneyShort(tot.open) : "—"}</td><td className="n num">{tot.got ? <b>{moneyShort(tot.got)}</b> : "—"}</td></tr></tfoot></table></div>
      : <p className="empty">No deals with a close date in this period.</p>}
    {undated > 0 && <p className="small muted" style={{ margin: "8px 0 0" }}>{undated} deal{undated === 1 ? " has" : "s have"} no close date, so {undated === 1 ? "it isn't" : "they aren't"} counted here. Add a close date on the deal to include {undated === 1 ? "it" : "them"}.</p>}
  </section>;
}
