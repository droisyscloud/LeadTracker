"use client";
import { useRef, useState } from "react";
import useSWR from "swr";
import { api, useData } from "./data";
import { money } from "./model";

/* Accounting: QuickBooks connection, imports from any other system, and invoices that need linking. */
type Info = { quickbooks: { configured: boolean; redirectUri: string; connected: boolean; companyName: string; status: string | null; lastError: string | null; lastSyncAt: number | null };
  counts: { total: number; linked: number }; unmatched: { id: string; source: string; docNumber: string; customerName: string; amount: number; balance: number; txnDate: string | null; dueDate: string | null }[] };
export function AccountingPanel() {
  const { m, run, perms } = useData(); const { data, mutate } = useSWR<Info>("/api/integrations/accounting", (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)));
  const file = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(""); const [pick, setPick] = useState<Record<string, string>>({});
  if (!data) return null;
  const q = data.quickbooks;
  const options = m.billing.filter((b) => b.kind === "invoice" && b.status !== "paid" && b.status !== "cancelled").map((b) => { const d = m.deals.find((x) => x.id === b.dealId);
    return [`billing:${b.id}`, `${m.companies.find((c) => c.id === d?.companyId)?.name || d?.name || ""} · ${b.label} · ${money(b.amount)}${b.invoiceNumber ? ` · ${b.invoiceNumber}` : ""}`] as [string, string]; });
  const imp = async (f: File | undefined) => { if (!f) return; setBusy("import"); const fd = new FormData(); fd.append("file", f);
    await run(async () => { const r = await fetch("/api/integrations/accounting/import", { method: "POST", body: fd }); const j = await r.json(); if (!r.ok) throw new Error(j.error || "Import failed");
      await mutate(); return j; }, "Imported. Matching invoices were updated."); setBusy(""); if (file.current) file.current.value = ""; };
  return <section className="panel s12 acct-panel">
    <h2>Accounting</h2><p className="small muted">Keep invoice numbers, statuses and payments in step with your accounting system, so invoices are marked invoiced and paid by themselves.</p>
    <div className="acct-grid">
      <div className="acct-box"><b>QuickBooks Online</b>
        {!q.configured ? <p className="small muted">Not set up on the server yet. Add QBO_CLIENT_ID and QBO_CLIENT_SECRET in Render (see the guide). Use this redirect address when you create the app at Intuit: <code>{q.redirectUri}</code></p>
          : q.connected ? <><p className="small">Connected to <b>{q.companyName || "QuickBooks"}</b>{q.lastSyncAt ? ` · last synced ${new Date(q.lastSyncAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : ""}. Syncs every hour.</p>
            {q.status === "error" && <p className="small acct-err">⚠ {q.lastError}</p>}
            <div className="btns"><button type="button" className="btn" disabled={!!busy} onClick={async () => { setBusy("sync"); await run(() => api("/api/integrations/accounting/sync", { json: {} }), "Synced with QuickBooks"); await mutate(); setBusy(""); }}>{busy === "sync" ? "Syncing…" : "Sync now"}</button>
              {perms.admin && <><a className="btn ghost" href="/api/integrations/quickbooks/connect">Reconnect</a><button type="button" className="btn ghost" onClick={async () => { if (confirm("Disconnect QuickBooks? Invoices already linked stay as they are.")) { await run(() => api("/api/integrations/quickbooks/disconnect", { json: {} }), "Disconnected"); mutate(); } }}>Disconnect</button></>}</div></>
          : perms.admin ? <><p className="small muted">Pulls invoices and payments every hour, so billing items are marked invoiced and paid by themselves.</p><a className="btn primary" href="/api/integrations/quickbooks/connect">Connect QuickBooks</a></> : <p className="small muted">Not connected. An admin can connect it.</p>}</div>
      <div className="acct-box"><b>Another system (Xero, Zoho Books, Tally, NetSuite, a spreadsheet)</b><p className="small muted">Upload an export of your invoices (CSV or Excel). AI works out the columns, and matching invoices are updated.</p>
        <input ref={file} type="file" hidden accept=".csv,.txt,.xlsx" onChange={(e) => imp(e.target.files?.[0])} /><button type="button" className="btn" disabled={!!busy} onClick={() => file.current?.click()}>{busy === "import" ? "Importing…" : "⬆ Import invoices"}</button></div>
    </div>
    <p className="small muted">{data.counts.linked} of {data.counts.total} accounting invoices are linked to billing items here.</p>
    {data.unmatched.length > 0 && <><h3>Needs linking ({data.unmatched.length})</h3><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Invoice</th><th>Customer</th><th className="n">Amount</th><th>Dates</th><th>Is this…</th><th /></tr></thead>
      <tbody>{data.unmatched.slice(0, 50).map((x) => <tr key={x.id}><td><b>{x.docNumber}</b><div className="small muted">{x.source === "quickbooks" ? "QuickBooks" : "Imported"}</div></td><td>{x.customerName}</td><td className="n num">{money(x.amount)}{x.balance <= 0 ? <div className="small">paid</div> : null}</td>
        <td className="small">{x.txnDate || "—"} · due {x.dueDate || "—"}</td>
        <td><select aria-label="Match" value={pick[x.id] || ""} onChange={(e) => setPick({ ...pick, [x.id]: e.target.value })}><option value="">Choose an invoice…</option>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
        <td className="n"><button type="button" className="btn sm primary" disabled={!pick[x.id]} onClick={async () => { const [t, id] = pick[x.id].split(":"); await run(() => api("/api/integrations/accounting/link", { json: { id: x.id, localType: t, localId: id } }), "Linked and updated"); mutate(); }}>Link</button>
          <button type="button" className="linkbtn small" onClick={async () => { await run(() => api("/api/integrations/accounting/link", { json: { id: x.id, ignore: true } }), "Ignored"); mutate(); }}>Ignore</button></td></tr>)}</tbody></table></div></>}
  </section>;
}
