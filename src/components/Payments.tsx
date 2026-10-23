"use client";
import { useState } from "react";
import type { DealDTO, PaymentDTO } from "@/lib/types";
import { api, useData } from "./data";
import { money, todayStr, type Model } from "./model";

/** Money on a deal: received, scheduled (expected), overdue, and what's still pending with no date yet. */
export function dealMoney(m: Model, d: Pick<DealDTO, "id" | "value">) {
  const list = m.payments.filter((p) => p.dealId === d.id).sort((a, b) => a.date.localeCompare(b.date));
  const today = todayStr();
  const received = list.filter((p) => p.status === "received").reduce((n, p) => n + p.amount, 0);
  const expected = list.filter((p) => p.status === "expected").reduce((n, p) => n + p.amount, 0);
  const overdue = list.filter((p) => p.status === "expected" && p.date < today).reduce((n, p) => n + p.amount, 0);
  const pending = Math.max(0, d.value - received);
  return { list, received, expected, overdue, pending, unscheduled: Math.max(0, pending - expected), pct: d.value ? Math.min(100, Math.round((received / d.value) * 100)) : 0 };
}

/** The Payments section of a deal: progress, each payment, and adding one (received or expected). */
export function DealPayments({ deal }: { deal: DealDTO }) {
  const { m, run, perms } = useData();
  const mny = dealMoney(m, deal); const today = todayStr();
  const canEdit = perms.manage || !deal.ownerId || deal.ownerId === m.me.id;
  const [f, setF] = useState({ amount: "", status: "received" as "received" | "expected", date: today, note: "" });
  const [editing, setEditing] = useState<string | null>(null); const [ef, setEf] = useState({ amount: "", date: "", note: "" });
  const add = async () => {
    const amount = Number(String(f.amount).replace(/[^0-9.]/g, "")); if (!amount) return;
    if (await run(() => api(`/api/deals/${deal.id}/payments`, { json: { amount, status: f.status, date: f.date, note: f.note } }), f.status === "received" ? "Payment recorded" : "Expected payment added"))
      setF({ amount: "", status: f.status, date: today, note: "" });
  };
  const fill = () => setF({ ...f, amount: String(mny.pending - (f.status === "expected" ? mny.expected : 0) > 0 ? mny.pending - (f.status === "expected" ? mny.expected : 0) : "") });
  const cur = deal.currency || "USD";
  return <div className="pay">
    <div className="pay-head"><h3 className="section-h" style={{ margin: 0 }}>Payments</h3><span className="small muted">{cur}</span></div>
    <div className="pay-bar" role="img" aria-label={`${mny.pct}% received`}><i className="got" style={{ width: `${mny.pct}%` }} /><i className="due" style={{ width: `${deal.value ? Math.min(100 - mny.pct, (mny.expected / deal.value) * 100) : 0}%` }} /></div>
    <div className="pay-sum">
      <span><small>Received</small><b className="num won">{money(mny.received)}</b></span>
      <span><small>Pending</small><b className="num">{money(mny.pending)}</b></span>
      <span><small>Scheduled</small><b className="num">{money(mny.expected)}</b></span>
      {mny.overdue > 0 && <span className="late"><small>Overdue</small><b className="num">{money(mny.overdue)}</b></span>}
    </div>
    {mny.list.length > 0 && <ul className="pay-list">{mny.list.map((p: PaymentDTO) => { const late = p.status === "expected" && p.date < today;
      return <li key={p.id} className={p.status + (late ? " late" : "")}>
        {editing === p.id ? <span className="pay-edit">
          <input type="text" inputMode="decimal" value={ef.amount} onChange={(e) => setEf({ ...ef, amount: e.target.value })} aria-label="Amount" />
          <input type="date" value={ef.date} onChange={(e) => setEf({ ...ef, date: e.target.value })} aria-label="Date" />
          <input type="text" value={ef.note} placeholder="Note" onChange={(e) => setEf({ ...ef, note: e.target.value })} aria-label="Note" />
          <button className="btn primary sm" onClick={async () => { if (await run(() => api(`/api/deal-payments/${p.id}`, { method: "PATCH", json: { amount: Number(ef.amount.replace(/[^0-9.]/g, "")), date: ef.date, note: ef.note } }), "Payment updated")) setEditing(null); }}>Save</button>
          <button className="btn ghost sm" onClick={() => setEditing(null)}>Cancel</button></span>
        : <>
          <span className="pay-st">{p.status === "received" ? "✓ Received" : late ? "Overdue" : "Expected"}</span>
          <span className="pay-amt num">{money(p.amount)}</span>
          <span className="pay-date">{new Date(`${p.date}T12:00:00`).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}</span>
          <span className="pay-note">{p.note}</span>
          {canEdit && <span className="pay-act">
            {p.status === "expected" && <button className="linkbtn small" onClick={() => run(() => api(`/api/deal-payments/${p.id}`, { method: "PATCH", json: { status: "received", date: today } }), "Marked as received")}>Mark received</button>}
            <button className="linkbtn small" onClick={() => { setEditing(p.id); setEf({ amount: String(p.amount), date: p.date, note: p.note }); }}>Edit</button>
            <button className="linkbtn small" style={{ color: "var(--muted)" }} onClick={() => { if (confirm("Delete this payment?")) run(() => api(`/api/deal-payments/${p.id}`, { method: "DELETE" }), "Payment deleted"); }}>Delete</button></span>}
        </>}
      </li>; })}</ul>}
    {canEdit && <div className="pay-add">
      <div className="seg" role="group" aria-label="Payment type">
        <button type="button" aria-pressed={f.status === "received"} onClick={() => setF({ ...f, status: "received", date: today })}>Received</button>
        <button type="button" aria-pressed={f.status === "expected"} onClick={() => setF({ ...f, status: "expected" })}>Expected later</button></div>
      <input type="text" inputMode="decimal" placeholder={`Amount (${cur})`} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} aria-label="Payment amount" />
      <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label={f.status === "received" ? "Date received" : "Expected date"} />
      <input type="text" placeholder="Note, e.g. invoice 1042" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} aria-label="Payment note" />
      <button type="button" className="btn primary" disabled={!Number(String(f.amount).replace(/[^0-9.]/g, ""))} onClick={add}>{f.status === "received" ? "Add received" : "Add expected"}</button>
      {mny.pending > 0 && <button type="button" className="linkbtn small" onClick={fill}>Use the remaining {money(Math.max(0, mny.pending - (f.status === "expected" ? mny.expected : 0)))}</button>}
    </div>}
  </div>;
}
