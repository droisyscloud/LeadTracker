"use client";
import { useState } from "react";
import { api, useData } from "./data";

/* Base currency and exchange rates: totals across deals in different currencies are converted with these. */
const COMMON = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "SGD", "AED", "JPY", "CNY", "HKD", "MXN", "PHP", "MYR", "THB", "VND", "MOP", "NZD", "CHF", "ZAR"];
export function CurrencyPanel() {
  const { m, run, perms } = useData(); const fx = m.config.fx || { base: "USD", rates: {}, date: null, manual: {}, source: "none", error: null };
  const used = [...new Set([...m.deals.map((d) => (d.currency || fx.base).toUpperCase()), ...m.sows.map((s) => (s.currency || fx.base).toUpperCase())])].filter((c) => c !== fx.base).sort();
  const [manual, setManual] = useState<Record<string, string>>(Object.fromEntries(Object.entries(fx.manual || {}).map(([k, v]) => [k, String(v)])));
  const [add, setAdd] = useState(""); const shown = [...new Set([...used, ...Object.keys(manual)])].sort();
  const missing = used.filter((c) => !fx.rates[c]);
  const save = (json: unknown, ok: string) => run(() => api("/api/settings/currency", { method: "PATCH", json }), ok).then(() => location.reload());
  return <section className="panel s12 cur-panel"><h2>Currency</h2>
    <p className="small muted">Each deal keeps its own currency. Totals across deals (Home, Deals, Reports, Finance, targets) are converted to the base currency at these rates.</p>
    <div className="cur-head"><label>Base currency<select value={fx.base} disabled={!perms.admin} onChange={(e) => { if (confirm(`Show all totals in ${e.target.value}? Rates will be fetched for it.`)) save({ base: e.target.value }, "Base currency changed"); }}>{[...new Set([fx.base, ...COMMON])].map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
      <span className="small muted">{fx.date ? `Rates from the European Central Bank, ${fx.date}. Updated daily.` : "No rates fetched yet."}{fx.error ? ` Last update failed: ${fx.error}` : ""}</span>
      {perms.admin && <button type="button" className="btn sm" onClick={() => run(() => api("/api/settings/currency", { json: {} }), "Rates refreshed").then(() => location.reload())}>Refresh rates now</button>}</div>
    {missing.length > 0 && <p className="small acct-err">⚠ No rate for {missing.join(", ")} yet, so those amounts are added as they are. Refresh the rates or set them below.</p>}
    {shown.length ? <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Currency</th><th className="n">1 {fx.base} =</th><th>Your own rate (optional)</th></tr></thead>
      <tbody>{shown.map((c) => <tr key={c}><td><b>{c}</b>{used.includes(c) ? "" : <span className="small muted"> · not used yet</span>}</td><td className="n num">{fx.rates[c] ? `${fx.rates[c].toLocaleString(undefined, { maximumFractionDigits: 4 })} ${c}` : "—"}{fx.manual?.[c] ? <span className="small muted"> (yours)</span> : null}</td>
        <td><input type="number" min="0" step="any" disabled={!perms.admin} placeholder="Use the daily rate" value={manual[c] ?? ""} onChange={(e) => setManual({ ...manual, [c]: e.target.value })} aria-label={`Your rate for ${c}`} /></td></tr>)}</tbody></table></div>
      : <p className="small muted">All your deals are in {fx.base}.</p>}
    {perms.admin && <div className="btns"><select value={add} onChange={(e) => setAdd(e.target.value)} aria-label="Add a currency"><option value="">Add a currency…</option>{COMMON.filter((c) => c !== fx.base && !shown.includes(c)).map((c) => <option key={c} value={c}>{c}</option>)}</select>
      {add && <button type="button" className="btn sm" onClick={() => { setManual({ ...manual, [add]: "" }); setAdd(""); }}>Add</button>}
      <button type="button" className="btn primary" onClick={() => save({ manual: Object.fromEntries(Object.entries(manual).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)])) }, "Rates saved")}>Save rates</button></div>}
  </section>;
}
