"use client";
import Link from "next/link";
import { Discussion } from "./thread";
import { SelectAdd } from "./SelectAdd";
import { Portal } from "./Portal";
import { DealPayments } from "./Payments";
import { DealHistory } from "./History";
import { BookMeetingDialog } from "./views/BookMeetingDialog";
import { useState } from "react";
import type { ContactDTO, DealDTO, DealStage, TaskDTO } from "@/lib/types";
import { api, Modal, useData } from "./data";
import { coName, DEAL_LABEL, DEAL_STAGES, isOpenDeal, LOSS_REASONS, money, taskOverdue, todayStr, userName, WIN_REASONS } from "./model";
import { AiText } from "./AiText";
import { DealBillingSummary } from "./Billing";
import { DealQuotes } from "./Quotes";

/** Asks why a lead or deal was won or lost. */
export function OutcomeDialog({ kind, outcome, onSave, onClose }: { kind: "lead" | "deal"; outcome: "won" | "lost"; onSave: (reason: string, note: string) => void; onClose: () => void }) {
  const reasons = outcome === "won" ? WIN_REASONS : LOSS_REASONS;
  const [reason, setReason] = useState(reasons[0]); const [note, setNote] = useState("");
  return <Modal open onClose={onClose} label="Outcome"><div className="dlg form">
    <header><h2>{outcome === "won" ? `Why did we win this ${kind}?` : `Why didn't this ${kind} go ahead?`}</h2><button className="btn ghost" onClick={onClose}>Cancel</button></header>
    <div className="chips" style={{ marginTop: 0 }}>{reasons.map((r) => <button key={r} type="button" className="chip" aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>)}</div>
    <label>Notes (optional)<AiText kind="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What made the difference?" /></label>
    <div className="btns"><button className="btn primary" onClick={() => onSave(reason, note)}>Save</button></div>
  </div></Modal>;
}

export function DealDialog({ deal, contact, companyId, onClose }: { deal?: DealDTO; contact?: ContactDTO; companyId?: string | null; onClose: () => void }) {
  const { m, run, perms } = useData();
  const coId = deal?.companyId ?? contact?.companyId ?? companyId ?? null;
  const [meet, setMeet] = useState(false);
  const [f, setF] = useState({ name: deal?.name || (contact ? `${coName(m, contact) || contact.name} opportunity` : ""), value: String(deal?.value ?? ""), currency: deal?.currency || "USD",
    stage: (deal?.stage || "qualify") as DealStage, probability: String(deal?.probability ?? ""), closeDate: deal?.closeDate || "", productId: deal?.productId || contact?.productIds[0] || "",
    companyId: coId || "", contactId: deal?.contactId ?? contact?.id ?? "", ownerId: deal?.ownerId ?? m.me.id, teamId: deal?.teamId ?? contact?.teamId ?? "" });
  const [outcome, setOutcome] = useState<"won" | "lost" | null>(null); const [notes, setNotes] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const people = m.contacts.filter((c) => !f.companyId || c.companyId === f.companyId);
  async function save(reason?: string, note?: string) {
    const json: Record<string, unknown> = { name: f.name.trim(), value: Math.round(Number(f.value) || 0), currency: f.currency, stage: f.stage, closeDate: f.closeDate || null,
      productId: f.productId || null, companyId: f.companyId || null, contactId: f.contactId || null, ownerId: f.ownerId || null, teamId: f.teamId || null };
    if (f.probability !== "") json.probability = Math.max(0, Math.min(100, Number(f.probability)));
    if (!deal && notes.trim()) json.notes = notes.trim();
    if (reason !== undefined) { json.outcomeReason = reason; json.outcomeNote = note || ""; }
    const r = deal ? await run(() => api(`/api/deals/${deal.id}`, { method: "PATCH", json }), "Deal saved") : await run(() => api("/api/deals", { json }), "Deal added");
    if (r) onClose();
  }
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (!f.name.trim()) return; if ((f.stage === "won" || f.stage === "lost") && f.stage !== deal?.stage) setOutcome(f.stage); else save(); };
  return <Modal open onClose={onClose} label={deal ? "Edit deal" : "New deal"}>
    <form className="dlg form" onSubmit={submit}>
      <header><h2>{deal ? "Edit deal" : "New deal"}</h2><button type="button" className="btn ghost" onClick={onClose}>Close</button></header>
      <label>Deal name<input type="text" value={f.name} onChange={set("name")} required autoFocus /></label>
      <div className="two">{perms.money && <label>Value<input type="text" inputMode="numeric" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value.replace(/[^\d]/g, "") })} placeholder="120000" /></label>}
        <label>Currency<select value={f.currency} onChange={set("currency")}>{["USD", "EUR", "GBP", "CAD", "INR", "AUD", "SGD", "MOP", "HKD"].map((c) => <option key={c}>{c}</option>)}</select></label></div>
      <div className="two"><label>Stage<select value={f.stage} onChange={set("stage")}>{DEAL_STAGES.map((s) => <option key={s[0]} value={s[0]}>{s[1]}</option>)}</select></label>
        <label>Probability %<input type="text" inputMode="numeric" placeholder="Default for stage" value={f.probability} onChange={(e) => setF({ ...f, probability: e.target.value.replace(/[^\d]/g, "").slice(0, 3) })} /></label></div>
      <div className="two"><label>Expected close<input type="date" value={f.closeDate} onChange={set("closeDate")} /></label>
        <label>Product<SelectAdd kind="product" value={f.productId} onChange={(v) => setF({ ...f, productId: v })}><option value="">None</option>{m.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectAdd></label></div>
      <div className="two"><label>Company<SelectAdd kind="company" value={f.companyId} onChange={(v) => setF({ ...f, companyId: v, contactId: "" })}><option value="">None</option>{[...m.companies].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectAdd></label>
        <label>Main contact<SelectAdd kind="contact" presetCompanyId={f.companyId || undefined} value={f.contactId} onChange={(v) => { const c = m.contactMap.get(v); setF({ ...f, contactId: v, companyId: f.companyId || c?.companyId || "" }); }}><option value="">None</option>{people.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectAdd></label></div>
      <div className="two"><label>Team<SelectAdd kind="team" value={f.teamId} onChange={(v) => setF({ ...f, teamId: v })}><option value="">No team</option>{m.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</SelectAdd></label>
      <label>Owner<select value={f.ownerId} onChange={set("ownerId")} disabled={!perms.manage}><option value="">Unassigned</option>{m.users.filter((u) => u.status === "active").map((u) => <option key={u.id} value={u.id}>{u.id === m.me.id ? "You" : u.name || u.email}</option>)}</select></label></div>
      {!deal && <label>Notes<AiText kind="note" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context, next steps, anything worth remembering" /></label>}
      <div className="btns"><button className="btn primary">{deal ? "Save deal" : "Add deal"}</button>
        {deal && perms.write && m.connection && <button type="button" className="btn" onClick={() => setMeet(true)}>Book meeting</button>}
        {deal && perms.del && (perms.manage || deal.createdById === m.me.id) && <button type="button" className="btn danger" onClick={async () => { if (confirm(`Delete ${deal.name}?`) && await run(() => api(`/api/deals/${deal.id}`, { method: "DELETE" }), "Moved to the recycle bin")) onClose(); }}>Delete</button>}</div>
    </form>
    {meet && deal && <Portal><BookMeetingDialog c={deal.contactId ? m.contactMap.get(deal.contactId) : undefined} companyId={deal.companyId} onClose={() => setMeet(false)} /></Portal>}
    {deal && perms.billing && <div className="dlg" style={{ paddingTop: 0 }}><DealPayments deal={m.deals.find((x) => x.id === deal.id) || deal} /></div>}
    {deal && perms.billing && <div className="dlg" style={{ paddingTop: 0 }}><DealBillingSummary deal={m.deals.find((x) => x.id === deal.id) || deal} /></div>}
    {deal && perms.money && <div className="dlg" style={{ paddingTop: 0 }}><DealQuotes deal={m.deals.find((x) => x.id === deal.id) || deal} /></div>}
    {deal && <div className="dlg" style={{ paddingTop: 0 }}><DealHistory dealId={deal.id} /></div>}
    {deal && <div className="dlg" style={{ paddingTop: 0 }}><h3 className="section-h" style={{ marginTop: 0 }}>Team discussion</h3><Discussion type="deal" id={deal.id} compact /></div>}
    {outcome && <OutcomeDialog kind="deal" outcome={outcome} onClose={() => setOutcome(null)} onSave={(r, n) => { setOutcome(null); save(r, n); }} />}
  </Modal>;
}

export function DealList({ deals, showCompany = true }: { deals: DealDTO[]; showCompany?: boolean }) {
  const { m } = useData();
  const [edit, setEdit] = useState<DealDTO | null>(null);
  if (!deals.length) return <p className="empty">No deals yet.</p>;
  return <><ul className="rows">{deals.map((d) => <li key={d.id} className="prodrow" onClick={() => setEdit(d)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setEdit(d)}>
    <span style={{ minWidth: 0 }}><span className="nm" style={{ display: "block" }}>{d.name}</span>
      <span className="small muted">{[showCompany && d.companyId ? m.companyMap.get(d.companyId)?.name : null, d.productId ? m.productMap.get(d.productId)?.name : null, d.closeDate ? `close ${d.closeDate}` : null, userName(m, d.ownerId)].filter(Boolean).join(" · ")}</span></span>
    <span style={{ textAlign: "right" }}><b className="num">{money(d.value, d.currency)}</b><br /><span className="pill" style={!isOpenDeal(d) ? { color: d.stage === "won" ? "var(--warm)" : "var(--cold)" } : undefined}>{DEAL_LABEL[d.stage]}{isOpenDeal(d) ? ` · ${d.probability}%` : ""}</span></span>
  </li>)}</ul>{edit && <DealDialog deal={edit} onClose={() => setEdit(null)} />}</>;
}

export { TaskDialog, TaskList } from "./tasks";
