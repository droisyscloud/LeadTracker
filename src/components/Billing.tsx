"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import type { BillingDTO, DealDTO, SowDTO } from "@/lib/types";
import { api, Modal, useData } from "./data";
import { money, moneyShort, todayStr, userName } from "./model";
import { Portal } from "./Portal";
import { Icon } from "./ui";
import { inRange, periodRange, PERIODS, type PeriodKey } from "./periods";
import { CollectionsView, ExpensesView, ProjectsView } from "./Collections";
import { FinanceView } from "./Finance";

type Draft = { label: string; percent: number | null; amount: number; dueDate: string | null; trigger: string; kind: "invoice" | "renewal"; keep?: boolean; paid?: boolean; paidOn?: string | null };
const STATUS: Record<BillingDTO["status"], [string, string]> = {
  scheduled: ["Scheduled", "var(--k-task)"], requested: ["Invoice requested", "var(--k-email-out)"], invoiced: ["Invoiced, awaiting payment", "var(--mild)"], paid: ["Paid", "var(--warm)"], cancelled: ["Cancelled", "var(--k-system)"],
};
export const SOW_TYPE: Record<string, string> = { fixed: "Fixed bid", milestone: "Fixed bid / milestone", tm: "Time & materials", retainer: "Retainer", other: "Other" };
/** What an SOW is still missing before billing can run smoothly. */
export const sowMissing = (s: SowDTO, billing: BillingDTO[]) => [!s.value && "contract value", (!s.startDate || !s.endDate) && "dates", s.netDays == null && "payment terms", !billing.some((b) => b.sowId === s.id) && "invoice schedule"].filter(Boolean) as string[];
const fmtD = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : "No date yet");

/** Pick people to tag: chips of everyone active. */
function People({ value, onChange, exclude }: { value: string[]; onChange: (v: string[]) => void; exclude?: string | null }) {
  const { m, perms } = useData();
  const people = m.users.filter((u) => u.status === "active" && u.id !== exclude);
  if (!people.length) return <p className="small muted tag-empty" style={{ margin: 0 }}>No one else to tag yet. Teammates appear here once they have signed in for the first time{perms.admin ? <> (invite them under <Link className="colink" href="/team">Users</Link>)</> : null}.</p>;
  return <div className="chips" style={{ marginTop: 0 }}>{people.map((u) => <button key={u.id} type="button" className="chip" aria-pressed={value.includes(u.id)}
    onClick={() => onChange(value.includes(u.id) ? value.filter((x) => x !== u.id) : [...value, u.id])}>{u.id === m.me.id ? "Me" : u.name || u.email}</button>)}</div>;
}

/** Review what AI read from the SOW before anything is saved. Every line is editable. */
function SowReview({ sow, draft, warnings, deal, onClose }: { sow: SowDTO; draft: Draft[]; warnings: string[]; deal: DealDTO; onClose: () => void }) {
  const { m, run } = useData();
  const [rows, setRows] = useState<Draft[]>(draft.map((d) => ({ ...d, keep: true, paid: false, paidOn: null })));
  const [assignee, setAssignee] = useState(deal.ownerId || m.me.id); const [tagged, setTagged] = useState<string[]>([]); const [auto, setAuto] = useState(false);
  const set = (i: number, p: Partial<Draft>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const keep = rows.filter((r) => r.keep && r.label.trim());
  const inv = keep.filter((r) => r.kind === "invoice");
  const paidTotal = inv.filter((r) => r.paid).reduce((n, r) => n + (r.amount || 0), 0); const pendingTotal = inv.filter((r) => !r.paid).reduce((n, r) => n + (r.amount || 0), 0);
  const undated = keep.filter((r) => !r.paid && !r.dueDate).length;
  const save = async () => {
    const items = keep.map((r) => ({ label: r.label.trim(), amount: Number(r.amount) || 0, percent: r.percent, dueDate: r.dueDate || null, trigger: r.trigger, kind: r.kind,
      status: r.paid && r.kind === "invoice" ? "paid" : "scheduled", paidOn: r.paid ? r.paidOn || r.dueDate || todayStr() : null,
      assigneeId: assignee || null, watcherIds: tagged, autoSend: auto && r.kind === "invoice" && !r.paid }));
    if (await run(() => api(`/api/sows/${sow.id}/schedule`, { json: { items } }), `Saved: ${items.filter((x) => x.status === "paid").length} paid, ${items.filter((x) => x.status !== "paid").length} pending`)) onClose();
  };
  return <Modal open onClose={onClose} label="Review the billing schedule"><div className="dlg dlg-wide form sow-review">
    <header><div><h2>Check the payments in this SOW</h2><div className="small muted">{sow.title}{sow.value ? ` · ${sow.currency} ${sow.value.toLocaleString()}` : ""}{sow.netDays !== null ? ` · Net ${sow.netDays}` : ""}{sow.poNumber ? ` · PO ${sow.poNumber}` : ""}</div></div>
      <button className="btn ghost" onClick={onClose}>Close</button></header>
    <p className="sr-hint">AI found these payments. For each one, check the amount and date, and say whether it's <b>pending</b> or already <b>paid</b>. Pending ones get reminders; paid ones are recorded as money received.</p>
    {sow.endDate && <p className="small muted" style={{ margin: 0 }}>Ends {fmtD(sow.endDate)}{sow.endDateSource ? <> · from the SOW: “{sow.endDateSource}”</> : null}</p>}
    {warnings.length > 0 && <div className="banner" style={{ margin: 0, borderColor: "var(--mild)" }}><b>Please check:</b><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
    <div className="sr-sum"><span><small>Pending</small><b className="num">{sow.currency} {pendingTotal.toLocaleString()}</b></span><span><small>Already paid</small><b className="num won">{sow.currency} {paidTotal.toLocaleString()}</b></span>
      <span><small>Payments</small><b>{inv.length}</b></span></div>
    <div className="sr-rows">{rows.map((r, i) => <div key={i} className={"sr-row" + (r.keep ? "" : " off") + (r.paid ? " paid" : "") + (r.kind === "renewal" ? " renew" : "")}>
      <div className="sr-top">
        <input type="text" value={r.label} onChange={(e) => set(i, { label: e.target.value })} aria-label="What" placeholder="What is this payment for?" />
        <button type="button" className="linkbtn small" onClick={() => set(i, { keep: !r.keep })}>{r.keep ? "Leave out" : "Include"}</button>
      </div>
      {r.kind === "renewal" ? <div className="sr-fields"><label>Reminder on<input type="date" value={r.dueDate || ""} onChange={(e) => set(i, { dueDate: e.target.value || null })} /></label><span className="small muted">A reminder to talk about renewing before the SOW ends.</span></div>
        : <div className="sr-fields">
          <label>Amount ({sow.currency}){r.percent !== null ? ` · ${r.percent}%` : ""}<input type="text" inputMode="decimal" value={String(r.amount ?? "")} onChange={(e) => set(i, { amount: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} aria-label="Amount" /></label>
          <label>Invoice date<input type="date" value={r.dueDate || ""} onChange={(e) => set(i, { dueDate: e.target.value || null })} aria-label="Invoice date" className={r.keep && !r.paid && !r.dueDate ? "needs" : ""} /></label>
          <div className="sr-status"><span className="lbl">Status</span><div className="seg" role="group" aria-label="Status">
            <button type="button" aria-pressed={!r.paid} onClick={() => set(i, { paid: false })}>Pending</button>
            <button type="button" aria-pressed={!!r.paid} onClick={() => set(i, { paid: true, paidOn: r.paidOn || (r.dueDate && r.dueDate <= todayStr() ? r.dueDate : todayStr()) })}>Paid</button></div></div>
          {r.paid && <label>Paid on<input type="date" value={r.paidOn || ""} onChange={(e) => set(i, { paidOn: e.target.value || null })} aria-label="Paid on" /></label>}
        </div>}
      {r.trigger && <div className="small muted">Due when: {r.trigger}</div>}
    </div>)}</div>
    <button type="button" className="linkbtn" style={{ justifySelf: "start" }} onClick={() => setRows([...rows, { label: "", percent: null, amount: 0, dueDate: null, trigger: "", kind: "invoice", keep: true, paid: false, paidOn: null }])}>+ Add a payment</button>
    {undated > 0 && <p className="small" style={{ margin: 0, color: "var(--mild)" }}>{undated} pending payment{undated === 1 ? " has" : "s have"} no invoice date yet, so no reminder will go out until you set one.</p>}
    <details className="sr-more"><summary>Reminders and people</summary>
      <label>Who looks after these invoices<select value={assignee} onChange={(e) => setAssignee(e.target.value)}>{m.users.filter((u) => u.status === "active").map((u) => <option key={u.id} value={u.id}>{u.id === m.me.id ? "Me" : u.name || u.email}</option>)}</select></label>
      <label>Tag people (they get the reminders too)<People value={tagged} onChange={setTagged} exclude={assignee} /></label>
      <label className="inline"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />Email the accounts team automatically on each invoice date</label>
    </details>
    <div className="btns"><button className="btn primary" disabled={!keep.length} onClick={save}>Save {keep.length} payment{keep.length === 1 ? "" : "s"}</button>
      <span className="small muted">Pending payments get a reminder the day before their invoice date and when overdue.</span></div>
  </div></Modal>;
}

/** Preview and send the request to the accounts team. */
function RequestDialog({ item, onClose }: { item: BillingDTO; onClose: () => void }) {
  const { run, toast } = useData();
  const [p, setP] = useState<{ subject: string; text: string; to: string[]; attachment: string | null } | null>(null); const [to, setTo] = useState(""); const [text, setText] = useState("");
  const loaded = useRef(false);
  if (!loaded.current) { loaded.current = true; api<{ subject: string; text: string; to: string[]; attachment: string | null }>(`/api/billing/${item.id}/request`).then((r) => { setP(r); setTo(r.to.join(", ")); setText(r.text); }).catch((e) => toast(e.message, "error")); }
  const send = async () => { const list = to.split(/[,;\s]+/).filter(Boolean); if (await run(() => api(`/api/billing/${item.id}/request`, { json: { to: list, text } }), "Invoice request sent to accounts")) onClose(); };
  return <Modal open onClose={onClose} label="Ask accounts to invoice"><div className="dlg form">
    <header><h2>Ask accounts to invoice</h2><button className="btn ghost" onClick={onClose}>Close</button></header>
    {!p ? <p className="muted">Preparing the email…</p> : <>
      <label>To<input type="text" value={to} onChange={(e) => setTo(e.target.value)} placeholder="accounts@yourcompany.com" /></label>
      {!p.to.length && <p className="small" style={{ margin: 0, color: "var(--mild)" }}>Tip: an admin can save the accounts team's address under Settings, Billing, so it's filled in every time.</p>}
      <label>Subject<input type="text" value={p.subject} readOnly /></label>
      <label>Message<textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} /></label>
      {p.attachment && <p className="small muted" style={{ margin: 0 }}>📎 {p.attachment} will be attached.</p>}
      <div className="btns"><button className="btn primary" disabled={!to.trim()} onClick={send}>Send to accounts</button><span className="small muted">Sent from your own mailbox when it's connected.</span></div>
    </>}
  </div></Modal>;
}

/** Everything about one billing line, from scheduling to payment. */
function BillingDetail({ b, deal, onClose }: { b: BillingDTO; deal?: DealDTO; onClose: () => void }) {
  const { m } = useData();
  const sow = b.sowId ? m.sows.find((s) => s.id === b.sowId) : undefined; const pay = b.paymentId ? m.payments.find((p) => p.id === b.paymentId) : undefined;
  const co = deal?.companyId ? m.companyMap.get(deal.companyId) : undefined; const cur = deal?.currency || sow?.currency || "USD";
  const [label, color] = STATUS[b.status];
  // a line marked paid when it was added never went through requesting and invoicing: say so plainly
  const direct = b.status === "paid" && !b.requestedAt && !b.invoicedOn;
  const steps: [string, string, boolean][] = b.kind === "renewal" ? [["Reminder", fmtD(b.dueDate), true], ["Done", b.status === "cancelled" ? "Done" : "Not yet", b.status === "cancelled"]] : [
    ["Scheduled", b.dueDate ? `Invoice date ${fmtD(b.dueDate)}` : direct ? "Added as already paid" : "No invoice date yet", true],
    ["Invoice requested", b.requestedAt ? `${new Date(b.requestedAt).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}${b.requestedById ? ` by ${userName(m, b.requestedById)}` : ""}${b.requestedTo.length ? ` · sent to ${b.requestedTo.join(", ")}` : ""}` : direct ? "Skipped: marked as paid directly" : "Not yet", !!b.requestedAt || direct],
    ["Invoiced", b.invoicedOn ? `${fmtD(b.invoicedOn)}${b.invoiceNumber ? ` · invoice ${b.invoiceNumber}` : ""}${b.paymentDue ? ` · payment due ${fmtD(b.paymentDue)}` : ""}` : direct ? "Skipped: marked as paid directly" : "Not yet", b.status === "invoiced" || b.status === "paid"],
    ["Paid", b.paidOn ? `${fmtD(b.paidOn)}${pay ? ` · ${cur} ${pay.amount.toLocaleString()} recorded in the deal's payments` : ""}` : "Not yet", b.status === "paid"],
  ];
  return <Modal open onClose={onClose} label="Billing details"><div className="dlg form bill-detail">
    <header><div><span className="kbadge" style={{ ["--kc" as string]: color }}>{b.kind === "renewal" ? "Renewal" : label}</span><h2 style={{ marginTop: 6 }}>{b.label}</h2>
      <div className="small muted">{co?.name ? `${co.name} · ` : ""}{deal ? <Link className="colink" href={`/deals?id=${deal.id}`}>{deal.name}</Link> : null}</div></div>
      <button className="btn ghost" onClick={onClose}>Close</button></header>
    {b.kind === "invoice" && <div className="sow-tot"><span><small>Amount</small><b className="num">{cur} {b.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></span>
      {b.percent !== null && <span><small>Share of contract</small><b>{b.percent}%</b></span>}{sow?.netDays !== null && sow?.netDays !== undefined && <span><small>Payment terms</small><b>Net {sow.netDays}</b></span>}
      {sow?.poNumber && <span><small>PO</small><b>{sow.poNumber}</b></span>}</div>}
    <ol className="bd-steps">{steps.map(([t, d, done]) => <li key={t} className={done ? "done" : ""}><b>{t}</b><span>{d}</span></li>)}</ol>
    <dl className="bd-facts">
      {sow && <><dt>SOW</dt><dd>📄 {sow.title}{sow.fileId && <> · <a className="colink" href={`/api/files/${sow.fileId}`} target="_blank" rel="noopener">Open the document</a></>}</dd></>}
      {b.trigger && <><dt>Due when</dt><dd>{b.trigger}</dd></>}
      <dt>Looked after by</dt><dd>{b.assigneeId ? userName(m, b.assigneeId) : "No one"}</dd>
      <dt>Tagged</dt><dd>{b.watcherIds.length ? b.watcherIds.map((w) => userName(m, w)).join(", ") : "No one"}</dd>
      {b.kind === "invoice" && !direct && <><dt>Request to accounts</dt><dd>{b.requestedAt ? (b.autoSend ? "Sent automatically on the invoice date" : "Sent by hand") : b.autoSend ? "Will be sent automatically on the invoice date" : "Not sent yet"}</dd></>}
      {sow?.billingContact && <><dt>Customer billing contact</dt><dd>{sow.billingContact}</dd></>}
      {b.note && <><dt>Notes</dt><dd style={{ whiteSpace: "pre-wrap" }}>{b.note}</dd></>}
      <dt>Added</dt><dd>{new Date(b.createdAt).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}{b.createdById ? ` by ${userName(m, b.createdById)}` : ""}</dd>
    </dl>
  </div></Modal>;
}

/** One billing line, with the next step for it. */
export function BillingRow({ b, deal, showDeal = false }: { b: BillingDTO; deal?: DealDTO; showDeal?: boolean }) {
  const { m, run, perms } = useData();
  const [req, setReq] = useState(false); const [edit, setEdit] = useState(false); const [info, setInfo] = useState(false);
  const [f, setF] = useState({ label: b.label, amount: String(b.amount), dueDate: b.dueDate || "", assigneeId: b.assigneeId || "", watcherIds: b.watcherIds, autoSend: b.autoSend, note: b.note });
  const today = todayStr(); const cur = deal?.currency || "USD";
  const can = perms.manage || !deal?.ownerId || deal?.ownerId === m.me.id;
  const late = b.kind === "invoice" && ((b.status === "scheduled" && b.dueDate && b.dueDate < today) || (b.status === "invoiced" && b.paymentDue && b.paymentDue < today));
  const [label, color] = STATUS[b.status];
  const patch = (json: Record<string, unknown>, msg: string) => run(() => api(`/api/billing/${b.id}`, { method: "PATCH", json }), msg);
  // the form always starts from the line as it is now (not as it was when the page first loaded)
  const openEdit = () => { setF({ label: b.label, amount: String(b.amount), dueDate: (b.status === "paid" ? b.paidOn : b.status === "invoiced" ? b.paymentDue || b.dueDate : b.dueDate) || "", assigneeId: b.assigneeId || "", watcherIds: b.watcherIds, autoSend: b.autoSend, note: b.note }); setEdit(true); };
  const remove = () => {
    if (b.status === "paid" && b.paymentId) {
      if (!confirm(`Remove "${b.label}"? It was paid, and ${cur} ${b.amount.toLocaleString()} is recorded in the deal's payments.`)) return;
      const also = confirm("Also remove that recorded payment? Choose OK to remove it, or Cancel to keep the payment and remove only the billing line.");
      run(() => api(`/api/billing/${b.id}${also ? "?payment=remove" : ""}`, { method: "DELETE" }), also ? "Removed, with its payment" : "Removed (the payment is kept)"); return;
    }
    if (confirm("Remove this billing line and its reminder?")) run(() => api(`/api/billing/${b.id}`, { method: "DELETE" }), "Removed");
  };
  const dateField = b.status === "paid" ? "paidOn" : b.status === "invoiced" ? "paymentDue" : "dueDate";
  if (edit) return <li className="bi editing" data-id={b.id}><div className="form" style={{ width: "100%" }}>
    <div className="two"><label>What<input type="text" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></label>
      <label>Amount ({cur})<input type="text" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label></div>
    <div className="two"><label>{dateField === "paidOn" ? "Paid on" : dateField === "paymentDue" ? "Payment due" : "Invoice date"}<input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></label>
    <label>Looked after by<select value={f.assigneeId} onChange={(e) => setF({ ...f, assigneeId: e.target.value })}><option value="">No one</option>{m.users.filter((u) => u.status === "active").map((u) => <option key={u.id} value={u.id}>{u.id === m.me.id ? "Me" : u.name || u.email}</option>)}</select></label></div>
    <label>Tag people<People value={f.watcherIds} onChange={(v) => setF({ ...f, watcherIds: v })} exclude={f.assigneeId} /></label>
    <label>Note<input type="text" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
    {b.kind === "invoice" && <label className="inline" style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><input type="checkbox" checked={f.autoSend} onChange={(e) => setF({ ...f, autoSend: e.target.checked })} style={{ width: "auto" }} />Email accounts automatically on the invoice date</label>}
    <div className="btns"><button className="btn primary" onClick={async () => { if (await patch({ label: f.label, amount: Number(f.amount.replace(/[^0-9.]/g, "")) || 0, [dateField]: f.dueDate || null, assigneeId: f.assigneeId || null, watcherIds: f.watcherIds, autoSend: f.autoSend, note: f.note }, "Saved")) setEdit(false); }}>Save</button>
      <button className="btn ghost" onClick={() => setEdit(false)}>Cancel</button></div></div></li>;
  return <li data-id={b.id} className={"bi " + b.status + (late ? " late" : "") + (b.kind === "renewal" ? " renew" : "")} style={{ ["--bc" as string]: late ? "var(--cold)" : color }}>
    <div className="bi-main" role="button" tabIndex={0} title="Show details" onClick={() => setInfo(true)} onKeyDown={(e) => { if (e.key === "Enter") setInfo(true); }}>
      <div className="bi-top"><span className="kbadge" style={{ ["--kc" as string]: late ? "var(--cold)" : color }}>{b.kind === "renewal" ? "Renewal" : late ? (b.status === "invoiced" ? "Payment overdue" : "Overdue") : label}</span>
        <b>{b.label}</b>{showDeal && deal && <Link className="small colink" href={`/deals?id=${deal.id}`}>{deal.name}</Link>}</div>
      <div className="bi-meta">
        {b.kind === "invoice" && <span className="num">{cur} {b.amount.toLocaleString()}</span>}
        <span>{b.status === "invoiced" && b.paymentDue ? `Payment due ${fmtD(b.paymentDue)}` : b.status === "paid" ? `Paid ${fmtD(b.paidOn)}` : fmtD(b.dueDate)}</span>
        {b.invoiceNumber && <span>Invoice {b.invoiceNumber}</span>}
        {b.assigneeId && <span>👤 {userName(m, b.assigneeId)}</span>}
        {b.watcherIds.length > 0 && <span>+{b.watcherIds.length} tagged</span>}
        {b.autoSend && b.status === "scheduled" && <span className="auto">Auto-email on the day</span>}
        {b.requestedAt && b.status !== "paid" && <span>Requested {new Date(b.requestedAt).toLocaleDateString()}</span>}
        {!b.dueDate && b.status === "scheduled" && <span style={{ color: "var(--mild)" }}>{b.trigger || "Set a date"}</span>}
      </div>
    </div>
    {can && b.status !== "paid" && b.status !== "cancelled" && <div className="bi-act">
      {b.kind === "invoice" && (b.status === "scheduled" || b.status === "requested") && <button className="btn sm primary" onClick={() => setReq(true)}><Icon name="send" size={13} />{b.status === "requested" ? "Ask again" : "Ask accounts to invoice"}</button>}
      {b.kind === "invoice" && b.status !== "invoiced" && <button className="btn sm" onClick={() => { const n = prompt("Invoice number (optional)", b.invoiceNumber); if (n !== null) patch({ status: "invoiced", invoiceNumber: n }, "Marked as invoiced"); }}>Invoiced</button>}
      {b.kind === "invoice" && <button className="btn sm" onClick={() => patch({ status: "paid" }, "Marked as paid and added to the deal's payments")}>Paid</button>}
      {b.kind === "renewal" && <button className="btn sm" onClick={() => patch({ status: "cancelled" }, "Done")}>Done</button>}
      <button className="linkbtn small" onClick={() => setInfo(true)}>Details</button><button className="linkbtn small" onClick={openEdit}>Edit</button>
      <button className="linkbtn small" style={{ color: "var(--muted)" }} onClick={remove}>Remove</button>
    </div>}
    {can && (b.status === "paid" || b.status === "cancelled") && <div className="bi-act"><button className="linkbtn small" onClick={() => setInfo(true)}>Details</button><button className="linkbtn small" onClick={openEdit}>Edit</button><button className="linkbtn small" style={{ color: "var(--muted)" }} onClick={remove}>Remove</button></div>}
    {req && <Portal><RequestDialog item={b} onClose={() => setReq(false)} /></Portal>}
    {info && <Portal><BillingDetail b={b} deal={deal} onClose={() => setInfo(false)} /></Portal>}
  </li>;
}

/** Removing a SOW: say exactly what happens to its billing lines and payments, and let the person choose. */
function RemoveSow({ sow, lines, onClose }: { sow: SowDTO; lines: BillingDTO[]; onClose: () => void }) {
  const { run } = useData();
  const paid = lines.filter((l) => l.status === "paid"); const open = lines.length - paid.length;
  const [choice, setChoice] = useState<"unpaid" | "all" | "keep">("unpaid");
  const go = async () => { if (await run(() => api(`/api/sows/${sow.id}${choice === "all" ? "?remove=all" : choice === "keep" ? "?keep=all" : ""}`, { method: "DELETE" }), "SOW removed")) onClose(); };
  return <Modal open onClose={onClose} label="Remove SOW"><div className="dlg form">
    <header><h2>Remove "{sow.title}"?</h2><button className="btn ghost" onClick={onClose}>Close</button></header>
    <p style={{ margin: 0 }}>This SOW has {lines.length} billing line{lines.length === 1 ? "" : "s"}: {open} not paid yet{paid.length ? `, ${paid.length} paid` : ""}.</p>
    <div className="choices">
      <label><input type="radio" checked={choice === "unpaid"} onChange={() => setChoice("unpaid")} /> <span><b>Remove its {open} unpaid line{open === 1 ? "" : "s"} and their reminders</b>{paid.length ? <small>Paid lines stay, with their payments: that money was received.</small> : null}</span></label>
      {paid.length > 0 && <label><input type="radio" checked={choice === "all"} onChange={() => setChoice("all")} /> <span><b>Remove everything</b><small>All {lines.length} lines, and the {paid.length} payment{paid.length === 1 ? "" : "s"} recorded from them.</small></span></label>}
      <label><input type="radio" checked={choice === "keep"} onChange={() => setChoice("keep")} /> <span><b>Remove only the SOW document</b><small>Keep every billing line and reminder.</small></span></label>
    </div>
    <div className="btns"><button className="btn danger" onClick={go}>Remove</button><button className="btn ghost" onClick={onClose}>Cancel</button></div>
  </div></Modal>;
}

const canBill = (m: ReturnType<typeof useData>["m"], perms: ReturnType<typeof useData>["perms"], d?: DealDTO) => !!d && perms.write && (perms.manage || !d.ownerId || d.ownerId === m.me.id);
const fileTypes = ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

/**
 * Attach a SOW: choose the deal (unless it's already known), choose the file, AI reads it, then the review.
 * The same flow is used from the Billing page and from a deal.
 */
export function AttachSow({ dealId, onClose }: { dealId?: string; onClose: () => void }) {
  const { m, perms, toast } = useData();
  const deals = m.deals.filter((d) => canBill(m, perms, d)).sort((a, b) => a.name.localeCompare(b.name));
  const [pick, setPick] = useState(dealId || ""); const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<{ sow: SowDTO; items: Draft[]; warnings: string[] } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const deal = m.deals.find((d) => d.id === pick);
  const upload = async (f: File | undefined) => {
    if (!f || !deal) return; setBusy(true);
    const fd = new FormData(); fd.append("file", f);
    try { const r = await api<{ sow: SowDTO; draft: { items: Draft[]; warnings: string[] } }>(`/api/deals/${deal.id}/sows`, { form: fd }); setReview({ sow: r.sow, items: r.draft.items, warnings: r.draft.warnings }); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't attach the SOW.", "error"); }
    finally { setBusy(false); if (file.current) file.current.value = ""; }
  };
  if (review && deal) return <SowReview sow={review.sow} draft={review.items} warnings={review.warnings} deal={deal} onClose={onClose} />;
  return <Modal open onClose={onClose} label="Attach a SOW"><div className="dlg form attach-sow">
    <header><h2>Attach a SOW</h2><button className="btn ghost" onClick={onClose}>Close</button></header>
    <label>Deal<select aria-label="Deal for the SOW" value={pick} onChange={(e) => setPick(e.target.value)} disabled={!!dealId}>
      <option value="">Choose the deal this SOW is for…</option>{deals.map((d) => <option key={d.id} value={d.id}>{d.name}{d.companyId ? ` · ${m.companyMap.get(d.companyId)?.name || ""}` : ""}</option>)}</select></label>
    <p className="small muted" style={{ margin: 0 }}>A PDF, Word (.docx) or text file. AI reads the payment terms and sets up the invoice dates for you to check before anything is saved.</p>
    <div className="btns"><button className="btn primary" disabled={!deal || busy} onClick={() => file.current?.click()}>{busy ? "Reading the SOW…" : "📎 Choose the SOW file"}</button></div>
    {busy && <div className="ai-skeleton"><i /><i /></div>}
    <input ref={file} type="file" hidden accept={fileTypes} aria-label="SOW file" onChange={(e) => upload(e.target.files?.[0])} />
  </div></Modal>;
}

/** Add one billing line by hand: choose the deal (unless known), what, how much, when, who. */
function NewBillingItem({ dealId, onClose }: { dealId?: string; onClose: () => void }) {
  const { m, perms, run } = useData();
  const deals = m.deals.filter((d) => canBill(m, perms, d)).sort((a, b) => a.name.localeCompare(b.name));
  const [f, setF] = useState({ dealId: dealId || "", label: "", amount: "", dueDate: "", assigneeId: m.me.id, watcherIds: [] as string[], autoSend: false, paid: false, paidOn: "" });
  const deal = m.deals.find((d) => d.id === f.dealId);
  const save = async () => { if (await run(() => api(`/api/deals/${f.dealId}/billing`, { json: { label: f.label.trim(), amount: Number(f.amount.replace(/[^0-9.]/g, "")) || 0, dueDate: f.dueDate || null, status: f.paid ? "paid" : "scheduled", paidOn: f.paid ? f.paidOn || f.dueDate || todayStr() : null, assigneeId: f.assigneeId || null, watcherIds: f.watcherIds, autoSend: f.autoSend } }), "Billing reminder added")) onClose(); };
  return <Modal open onClose={onClose} label="New billing item"><div className="dlg form">
    <header><h2>New billing item</h2><button className="btn ghost" onClick={onClose}>Close</button></header>
    <label>Deal<select aria-label="Deal for the billing item" value={f.dealId} disabled={!!dealId} onChange={(e) => setF({ ...f, dealId: e.target.value })}><option value="">Choose the deal…</option>{deals.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
    <label>What<input type="text" value={f.label} placeholder="e.g. Milestone 2: UAT sign-off" onChange={(e) => setF({ ...f, label: e.target.value })} aria-label="What to invoice" /></label>
    <div className="two"><label>Amount{deal ? ` (${deal.currency})` : ""}<input type="text" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} aria-label="Amount to invoice" /></label>
      <label>Invoice date<input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} aria-label="Invoice date" /></label></div>
    <div className="sr-status"><span className="lbl">Status</span><div className="seg" role="group" aria-label="Status">
      <button type="button" aria-pressed={!f.paid} onClick={() => setF({ ...f, paid: false })}>Pending</button>
      <button type="button" aria-pressed={f.paid} onClick={() => setF({ ...f, paid: true, paidOn: f.paidOn || todayStr() })}>Paid</button></div></div>
    {f.paid && <label>Paid on<input type="date" value={f.paidOn} onChange={(e) => setF({ ...f, paidOn: e.target.value })} aria-label="Paid on" /></label>}
    <label>Looked after by<select value={f.assigneeId} onChange={(e) => setF({ ...f, assigneeId: e.target.value })}>{m.users.filter((u) => u.status === "active").map((u) => <option key={u.id} value={u.id}>{u.id === m.me.id ? "Me" : u.name || u.email}</option>)}</select></label>
    <label>Tag people<People value={f.watcherIds} onChange={(v) => setF({ ...f, watcherIds: v })} exclude={f.assigneeId} /></label>
    <label className="inline" style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><input type="checkbox" checked={f.autoSend} onChange={(e) => setF({ ...f, autoSend: e.target.checked })} style={{ width: "auto" }} />Email accounts automatically on the invoice date</label>
    <div className="btns"><button className="btn primary" disabled={!deal || !f.label.trim()} onClick={save}>Add billing item</button></div>
  </div></Modal>;
}

/** Money and dates for a set of billing lines. */
function lineTotals(lines: BillingDTO[]) {
  const inv = lines.filter((l) => l.kind === "invoice" && l.status !== "cancelled"); const today = todayStr();
  const sum = (f: (l: BillingDTO) => boolean) => inv.filter(f).reduce((n, l) => n + l.amount, 0);
  const next = inv.filter((l) => l.status === "scheduled" && l.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0];
  const overdue = inv.filter((l) => (l.status === "scheduled" && l.dueDate && l.dueDate < today) || (l.status === "invoiced" && l.paymentDue && l.paymentDue < today));
  const lastPaid = inv.filter((l) => l.status === "paid" && l.paidOn).sort((a, b) => b.paidOn!.localeCompare(a.paidOn!))[0];
  return { total: sum(() => true), invoiced: sum((l) => l.status === "invoiced" || l.status === "paid"), paid: sum((l) => l.status === "paid"), next, overdue, lastPaid };
}

/** One SOW in full: its terms (editable), its billing lines, and removing it. */
function SowDetail({ sow, onClose, start }: { sow: SowDTO; onClose: () => void; start?: "edit" | "remove" }) {
  const { m, perms, run } = useData();
  const deal = m.deals.find((d) => d.id === sow.dealId); const can = canBill(m, perms, deal);
  const lines = m.billing.filter((b) => b.sowId === sow.id).sort((a, b) => (a.dueDate || "9").localeCompare(b.dueDate || "9"));
  const [edit, setEdit] = useState(start === "edit"); const [del, setDel] = useState(start === "remove"); const [add, setAdd] = useState(false);
  const [f, setF] = useState({ title: sow.title, value: String(sow.value ?? ""), startDate: sow.startDate || "", endDate: sow.endDate || "", poNumber: sow.poNumber, billingContact: sow.billingContact, netDays: sow.netDays === null ? "" : String(sow.netDays),
    sowNumber: sow.sowNumber || "", sowType: sow.sowType || "", signStatus: sow.signStatus || "signed", projectId: sow.projectId || "", active: sow.active !== false });
  const t = lineTotals(lines);
  const save = async () => { if (await run(() => api(`/api/sows/${sow.id}`, { method: "PATCH", json: { sowNumber: f.sowNumber, sowType: f.sowType as SowDTO["sowType"], signStatus: f.signStatus as SowDTO["signStatus"], projectId: f.projectId || null, active: f.active, title: f.title, value: f.value ? Number(f.value.replace(/[^0-9.]/g, "")) : null, startDate: f.startDate || null, endDate: f.endDate || null, poNumber: f.poNumber, billingContact: f.billingContact, netDays: f.netDays === "" ? null : Number(f.netDays) } }), "SOW saved")) setEdit(false); };
  if (del) return <RemoveSow sow={sow} lines={lines} onClose={() => { setDel(false); if (start === "remove" || !m.sows.some((x) => x.id === sow.id)) onClose(); }} />;
  return <Modal open onClose={onClose} label="SOW"><div className="dlg dlg-wide form sow-detail">
    <header><div><h2>📄 {sow.title}</h2><div className="small muted">{deal ? <Link className="colink" href={`/deals?id=${deal.id}`}>{deal.name}</Link> : null}{deal?.companyId ? ` · ${m.companyMap.get(deal.companyId)?.name}` : ""}</div></div>
      <button className="btn ghost" onClick={onClose}>Close</button></header>
    {edit ? <div className="sow-edit">
      <div className="two"><label>SOW number<input type="text" value={f.sowNumber} onChange={(e) => setF({ ...f, sowNumber: e.target.value })} placeholder="e.g. SOW-1234" /></label>
        <label>SOW type<select value={f.sowType} onChange={(e) => setF({ ...f, sowType: e.target.value as typeof f.sowType })}><option value="">—</option>{Object.entries(SOW_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label></div>
      <div className="two"><label>Status<select value={f.signStatus} onChange={(e) => setF({ ...f, signStatus: e.target.value as typeof f.signStatus })}><option value="signed">Signed</option><option value="draft">Draft</option></select></label>
        <label>Project<select value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}><option value="">No project</option>{(m.projects || []).filter((p) => p.active || p.id === f.projectId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
      <label className="chk"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active (switch off when the contract is no longer in use)</label>
      <div className="two"><label>Title<input type="text" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label><label>Contract value ({sow.currency})<input type="text" inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></label></div>
      <div className="two"><label>Starts<input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></label><label>Ends<input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></label>{sow.endDateSource && <span className="small muted" style={{ gridColumn: "1 / -1" }}>The SOW says: “{sow.endDateSource}”. Changing the end date moves the renewal reminder.</span>}</div>
      <div className="two"><label>PO number<input type="text" value={f.poNumber} onChange={(e) => setF({ ...f, poNumber: e.target.value })} /></label><label>Payment terms (days after invoice)<input type="text" inputMode="numeric" value={f.netDays} placeholder="e.g. 30" onChange={(e) => setF({ ...f, netDays: e.target.value.replace(/\D/g, "") })} /></label></div>
      <label>Customer billing contact<input type="text" value={f.billingContact} onChange={(e) => setF({ ...f, billingContact: e.target.value })} /></label>
      <div className="btns"><button className="btn primary" onClick={save}>Save SOW</button><button className="btn ghost" onClick={() => setEdit(false)}>Cancel</button></div>
    </div> : <div className="sow">
      <div className="sow-meta">{sow.value ? <span>{sow.currency} {sow.value.toLocaleString()}</span> : null}{sow.startDate && <span>{fmtD(sow.startDate)} to {sow.endDate ? fmtD(sow.endDate) : "open"}</span>}
        {sow.netDays !== null && <span>Net {sow.netDays}</span>}{sow.poNumber && <span>PO {sow.poNumber}</span>}{sow.billingContact && <span>Billing: {sow.billingContact}</span>}</div>
      {sow.termsSummary && <p className="sow-sum">✦ {sow.termsSummary}</p>}
      <div className="inline" style={{ gap: 10, flexWrap: "wrap" }}>{sow.fileId && <a className="btn sm" href={`/api/files/${sow.fileId}`} target="_blank" rel="noopener">Open the document</a>}
        {can && <button className="btn sm" onClick={() => setEdit(true)}>Edit details</button>}{can && <button className="btn sm" onClick={() => setAdd(true)}>+ Billing item</button>}
        {can && <button className="btn sm ghost" style={{ color: "var(--cold)" }} onClick={() => setDel(true)}>Remove SOW</button>}</div>
    </div>}
    <div className="sow-tot"><span><small>Scheduled</small><b className="num">{money(t.total)}</b></span><span><small>Invoiced</small><b className="num">{money(t.invoiced)}</b></span><span><small>Last paid</small><b>{t.lastPaid ? `${fmtD(t.lastPaid.paidOn)}` : "—"}</b></span><span><small>Paid</small><b className="num won">{money(t.paid)}</b></span>
      <span><small>Next invoice</small><b>{t.next ? fmtD(t.next.dueDate) : "—"}</b></span>{t.overdue.length > 0 && <span className="late"><small>Overdue</small><b>{t.overdue.length}</b></span>}</div>
    {lines.length ? <ul className="bi-list">{lines.map((b) => <BillingRow key={b.id} b={b} deal={deal} />)}</ul> : <p className="empty">No billing lines from this SOW.</p>}
    {add && <Portal><NewBillingItem dealId={sow.dealId} onClose={() => setAdd(false)} /></Portal>}
  </div></Modal>;
}

/** On a deal: a compact summary, with the way into Billing and a shortcut to attach a SOW. */
export function DealBillingSummary({ deal }: { deal: DealDTO }) {
  const { m, perms } = useData();
  const sows = m.sows.filter((s) => s.dealId === deal.id); const lines = m.billing.filter((b) => b.dealId === deal.id);
  const t = lineTotals(lines); const can = canBill(m, perms, deal);
  const [attach, setAttach] = useState(false); const [open, setOpen] = useState<SowDTO | null>(null);
  return <div className="cb cb-sum">
    <div className="pay-head"><h3 className="section-h" style={{ margin: 0 }}>Contracts &amp; billing</h3>
      <span className="inline" style={{ gap: 6 }}>{can && <button className="btn sm" onClick={() => setAttach(true)}>📎 Attach SOW</button>}
        <Link className="btn sm" href={`/billing?deal=${deal.id}`}>Open in Billing and contracts →</Link></span></div>
    {sows.length || lines.length ? <>
      <div className="cb-line">{sows.map((s) => <button key={s.id} type="button" className="cb-sow" onClick={() => setOpen(s)}>📄 {s.title}</button>)}</div>
      <div className="sow-tot"><span><small>SOWs</small><b className="num">{sows.length}</b></span><span><small>Scheduled</small><b className="num">{deal.currency} {t.total.toLocaleString()}</b></span>
        <span><small>Paid</small><b className="num won">{deal.currency} {t.paid.toLocaleString()}</b></span><span><small>Next invoice</small><b>{t.next ? `${fmtD(t.next.dueDate)}` : "—"}</b></span>
        {t.overdue.length > 0 && <span className="late"><small>Overdue</small><b>{t.overdue.length}</b></span>}</div>
    </> : <p className="small muted" style={{ margin: 0 }}>No SOW yet. Attach the signed SOW and AI sets up the invoice reminders from its payment terms.</p>}
    {attach && <Portal><AttachSow dealId={deal.id} onClose={() => setAttach(false)} /></Portal>}
    {open && <Portal><SowDetail sow={open} onClose={() => setOpen(null)} /></Portal>}
  </div>;
}

/** The Billing and contracts page: where contracts and invoices are managed, across every deal. */
export function BillingView() {
  const { m, perms } = useData();
  const sp = useSearchParams(); const router = useRouter();
  const TABS = ["contracts", "collections", "projects", "expenses", "finance"] as const;
  const tab = (TABS as readonly string[]).includes(sp.get("tab") || "") ? (sp.get("tab") as (typeof TABS)[number]) : "invoices";
  const dealF = sp.get("deal") || "";
  const setParam = (k: string, v: string) => { const q = new URLSearchParams(sp.toString()); if (v) q.set(k, v); else q.delete(k); router.replace(`/billing${q.toString() ? `?${q}` : ""}`); };
  const [group, setGroup] = useState("all"); const [who, setWho] = useState("all"); const [co, setCo] = useState("all");
  const [period, setPeriod] = useState<PeriodKey>("all"); const [qq, setQq] = useState(""); const [sowType, setSowType] = useState("all"); const [sign, setSign] = useState("all");
  const [attach, setAttach] = useState(false); const [addItem, setAddItem] = useState(false); const [openSow, setOpenSow] = useState<{ sow: SowDTO; start?: "edit" | "remove" } | null>(null);
  const range = periodRange(period);
  const today = todayStr(); const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toLocaleDateString("en-CA");
  const dealOf = (id: string) => m.deals.find((d) => d.id === id);
  const matchDeal = (dealId: string) => { const d = dealOf(dealId); if (!d) return false;
    if (dealF && d.id !== dealF) return false; if (co !== "all" && d.companyId !== co) return false;
    if (qq.trim() && ![d.name, d.companyId ? m.companyMap.get(d.companyId)?.name : ""].join(" ").toLowerCase().includes(qq.trim().toLowerCase())) return false; return true; };
  const companies = [...new Set(m.billing.map((b) => dealOf(b.dealId)?.companyId).concat(m.sows.map((s) => dealOf(s.dealId)?.companyId)).filter(Boolean) as string[])].map((id) => m.companyMap.get(id)).filter(Boolean).sort((a, b) => a!.name.localeCompare(b!.name));
  const dealName = dealF ? dealOf(dealF)?.name : "";
  const dateOf = (b: BillingDTO) => b.status === "paid" ? b.paidOn : b.status === "invoiced" ? b.paymentDue || b.dueDate : b.dueDate;
  const all = m.billing.filter((b) => matchDeal(b.dealId) && (who === "all" || (who === "mine" ? b.assigneeId === m.me.id || b.watcherIds.includes(m.me.id) : b.assigneeId === who)) && inRange(dateOf(b), range));
  const inv = all.filter((b) => b.kind === "invoice");
  const groups: [string, string, BillingDTO[]][] = [
    ["all", "All", all.filter((b) => b.status !== "cancelled")],
    ["due", "Due this month", inv.filter((b) => b.status === "scheduled" && b.dueDate && b.dueDate <= monthEnd)],
    ["late", "Overdue", inv.filter((b) => (b.status === "scheduled" && b.dueDate && b.dueDate < today) || (b.status === "invoiced" && b.paymentDue && b.paymentDue < today))],
    ["upcoming", "Upcoming", inv.filter((b) => b.status === "scheduled" && (!b.dueDate || b.dueDate > monthEnd))],
    ["requested", "Requested", inv.filter((b) => b.status === "requested")],
    ["invoiced", "Awaiting payment", inv.filter((b) => b.status === "invoiced")],
    ["paid", "Paid", inv.filter((b) => b.status === "paid")],
    ["renewals", "Renewals", all.filter((b) => b.kind === "renewal" && b.status === "scheduled")],
  ];
  const cur = groups.find((g) => g[0] === group) || groups[0];
  const sum = (l: BillingDTO[]) => l.reduce((n, b) => n + b.amount, 0);
  const list = [...cur[2]].sort((a, b) => (dateOf(a) || "9").localeCompare(dateOf(b) || "9"));
  const sows = m.sows.filter((s) => matchDeal(s.dealId) && (!range || inRange(s.startDate, range) || inRange(s.endDate, range)) && (sowType === "all" || s.sowType === sowType) && (sign === "all" || s.signStatus === sign)).sort((a, b) => b.createdAt - a.createdAt);
  return <div className="dir">
    <div className="dir-head"><div className="dir-count"><b className="num">{moneyShort(sum(groups[1][2]))}</b><span>to invoice this month</span></div>
      <div className="dir-tools">
        <div className="dir-search"><Icon name="search" size={15} /><input type="search" placeholder="Search billing" aria-label="Find a customer or deal" value={qq} onChange={(e) => setQq(e.target.value)} /></div>
        {perms.write && <button className="btn" onClick={() => setAddItem(true)}>+ Billing item</button>}
        {perms.write && <button className="btn primary" onClick={() => setAttach(true)}>📎 Attach SOW</button>}
      </div></div>
    <div className="vt bill-tabs" role="tablist" aria-label="Billing">
      <button type="button" role="tab" aria-pressed={tab === "invoices"} aria-selected={tab === "invoices"} onClick={() => setParam("tab", "")}><Icon name="invoice" size={16} /><span>Invoices</span></button>
      <button type="button" role="tab" aria-pressed={tab === "contracts"} aria-selected={tab === "contracts"} onClick={() => setParam("tab", "contracts")}><Icon name="note" size={16} /><span>Contracts (SOWs)</span> <span className="n">{m.sows.length}</span></button>
      <button type="button" role="tab" aria-pressed={tab === "collections"} aria-selected={tab === "collections"} onClick={() => setParam("tab", "collections")}><Icon name="phone" size={16} /><span>Collections</span>{(m.followups || []).filter((f) => f.status === "open" && f.dueDate <= today).length > 0 && <span className="n">{(m.followups || []).filter((f) => f.status === "open" && f.dueDate <= today).length}</span>}</button>
      <button type="button" role="tab" aria-pressed={tab === "finance"} aria-selected={tab === "finance"} onClick={() => setParam("tab", "finance")}><Icon name="reports" size={16} /><span>Finance</span></button>
      <button type="button" role="tab" aria-pressed={tab === "projects"} aria-selected={tab === "projects"} onClick={() => setParam("tab", "projects")}><Icon name="companies" size={16} /><span>Projects</span></button>
      <button type="button" role="tab" aria-pressed={tab === "expenses"} aria-selected={tab === "expenses"} onClick={() => setParam("tab", "expenses")}><Icon name="deals" size={16} /><span>Expenses</span></button>
    </div>
    {tab === "finance" ? <FinanceView /> : tab === "collections" ? <CollectionsView /> : tab === "projects" ? <ProjectsView /> : tab === "expenses" ? <ExpensesView /> : <>
    <div className="bill-filters">
      {tab === "contracts" && <><select aria-label="SOW type" value={sowType} onChange={(e) => setSowType(e.target.value)}><option value="all">Any SOW type</option>{Object.entries(SOW_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select aria-label="Draft or signed" value={sign} onChange={(e) => setSign(e.target.value)}><option value="all">Draft and signed</option><option value="draft">Draft</option><option value="signed">Signed</option></select></>}
      <select aria-label="Customer" value={co} onChange={(e) => setCo(e.target.value)}><option value="all">All customers</option>{companies.map((c) => <option key={c!.id} value={c!.id}>{c!.name}</option>)}</select>
      {tab === "invoices" && <select aria-label="Whose" value={who} onChange={(e) => setWho(e.target.value)}><option value="all">Everyone</option><option value="mine">Mine and tagged</option>{m.users.filter((u) => u.status === "active").map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}</select>}
      <select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)}>{PERIODS.filter(([k]) => k !== "custom").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      {dealF && <span className="chip on" aria-pressed="true">Deal: {dealName} <button type="button" className="chip-x" aria-label="Show all deals" onClick={() => setParam("deal", "")}>×</button></span>}
    </div>
    {tab === "invoices" ? <>
      <div className="kpis bill-kpis">{([["Due this month", groups[1][2], "var(--k-task)"], ["Overdue", groups[2][2], "var(--cold)"], ["Requested", groups[4][2], "var(--k-email-out)"], ["Awaiting payment", groups[5][2], "var(--mild)"], ["Paid", groups[6][2], "var(--warm)"]] as [string, BillingDTO[], string][]).map(([l, g, c]) =>
        <div key={l} className="panel kpi" style={{ ["--k" as string]: c }}><span className="lab">{l}</span><span className="val">{moneyShort(sum(g))}</span><span className="small muted">{g.length} invoice{g.length === 1 ? "" : "s"}</span></div>)}</div>
      <div className="quick" role="group" aria-label="Show">{groups.map(([k, l, g]) => <button key={k} type="button" className="chip" aria-pressed={group === k} onClick={() => setGroup(k)}>{l} <span className="n">{g.length}</span></button>)}</div>
      <section className="panel">{list.length ? <ul className="bi-list">{list.map((b) => <BillingRow key={b.id} b={b} deal={dealOf(b.dealId)} showDeal />)}</ul>
        : <p className="empty">{m.billing.length ? "Nothing here with these filters." : "No billing set up yet. Attach a signed SOW and AI sets up the invoice dates from its payment terms."}</p>}</section>
    </> : <section className="panel">{sows.length ? <div className="tbl-wrap"><table className="tbl dir-tbl sow-list"><thead><tr><th>SOW</th><th>Customer · deal</th><th className="n">Value</th><th>Contract term</th><th>Payment terms</th><th className="n">Invoiced</th><th className="n">Paid</th><th>Last paid</th><th>Next invoice due</th><th aria-label="Actions" /></tr></thead>
      <tbody>{sows.map((s) => { const d = dealOf(s.dealId); const t = lineTotals(m.billing.filter((b) => b.sowId === s.id));
        return <tr key={s.id} tabIndex={0} onClick={() => setOpenSow({ sow: s })} onKeyDown={(e) => { if (e.key === "Enter") setOpenSow({ sow: s }); }}>
          <td><b>📄 {s.sowNumber ? `${s.sowNumber} · ` : ""}{s.title}</b><div className="sow-tags">{s.sowType && <span className="pill">{SOW_TYPE[s.sowType]}</span>}{s.signStatus === "draft" && <span className="pill sow-draft">Draft</span>}
            {sowMissing(s, m.billing).length > 0 && <span className="pill sow-incomplete" title={`Missing: ${sowMissing(s, m.billing).join(", ")}`}>Incomplete</span>}{!s.active && <span className="pill">Inactive</span>}
            {s.projectId && <span className="small muted">{(m.projects || []).find((p) => p.id === s.projectId)?.name}</span>}</div></td><td>{d?.companyId ? m.companyMap.get(d.companyId)?.name : ""}<br /><small className="muted">{d?.name}</small></td>
          <td className="n num">{s.value ? `${s.currency} ${s.value.toLocaleString()}` : "—"}</td>
          <td className="small">{s.startDate ? fmtD(s.startDate) : "—"}<br /><span className={s.endDate && s.endDate < today ? "late" : "muted"}>to {s.endDate ? fmtD(s.endDate) : "open"}</span></td>
          <td className="small">{s.netDays !== null ? `Net ${s.netDays}` : "—"}{s.poNumber ? <><br /><span className="muted">PO {s.poNumber}</span></> : null}</td>
          <td className="n num">{t.invoiced ? t.invoiced.toLocaleString() : "—"}</td><td className="n num won">{t.paid ? t.paid.toLocaleString() : "—"}</td>
          <td className="small">{t.lastPaid ? <>{fmtD(t.lastPaid.paidOn)}<br /><span className="muted">{t.lastPaid.amount.toLocaleString()}</span></> : "—"}</td>
          <td className="small">{t.next ? fmtD(t.next.dueDate) : "—"}{t.overdue.length ? <><br /><span className="late">{t.overdue.length} overdue</span></> : null}</td>
          <td className="sow-act" onClick={(e) => e.stopPropagation()}>{canBill(m, perms, d) && <><button type="button" className="btn sm" onClick={() => setOpenSow({ sow: s, start: "edit" })}>Edit</button>
            <button type="button" className="btn sm ghost danger-t" onClick={() => setOpenSow({ sow: s, start: "remove" })}>Remove</button></>}</td></tr>; })}</tbody></table></div>
      : <p className="empty">{m.sows.length ? "No SOWs match these filters." : "No SOWs yet. Attach the first one with 📎 Attach SOW."}</p>}</section>}
    </>}
    {attach && <Portal><AttachSow dealId={dealF || undefined} onClose={() => setAttach(false)} /></Portal>}
    {addItem && <Portal><NewBillingItem dealId={dealF || undefined} onClose={() => setAddItem(false)} /></Portal>}
    {openSow && <Portal><SowDetail sow={openSow.sow} start={openSow.start} onClose={() => setOpenSow(null)} /></Portal>}
  </div>;
}
