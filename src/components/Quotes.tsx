"use client";
import { useState } from "react";
import useSWR from "swr";
import type { DealDTO } from "@/lib/types";
import { api, Modal, useData } from "./data";
import { money } from "./model";

/* Quotes on a deal: draft (with AI), branded PDF, send, and see when the client opens or accepts. */
type Line = { description: string; qty: number; unitPrice: number };
type Q = { id: string; number: string; title: string; intro: string; terms: string; lines: Line[]; currency: string; discountPct: number; taxRate: number; total: number; validUntil: string | null;
  status: string; views: number; sentTo: string[]; respondedBy: string; token: string };
const STATUS: Record<string, string> = { draft: "Draft", sent: "Sent", viewed: "Viewed", accepted: "Accepted", declined: "Declined" };
export function DealQuotes({ deal }: { deal: DealDTO }) {
  const { m, run, perms } = useData(); const { data, mutate } = useSWR<{ quotes: Q[] }>(`/api/deals/${deal.id}/quotes`, (u: string) => fetch(u).then((r) => (r.ok ? r.json() : { quotes: [] })));
  const [edit, setEdit] = useState<Partial<Q> | null>(null); const [send, setSend] = useState<{ q: Q; to: string; subject: string; text: string } | null>(null); const [busy, setBusy] = useState(false);
  const contact = m.contacts.find((c) => c.id === deal.contactId);
  const t = (q: Partial<Q>) => { const g = (q.lines || []).reduce((n, l) => n + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0); const s = g * (1 - (q.discountPct || 0) / 100); return s * (1 + (q.taxRate || 0) / 100); };
  const blank = (): Partial<Q> => ({ title: deal.name, intro: "", terms: "", lines: [{ description: "", qty: 1, unitPrice: deal.value || 0 }], currency: deal.currency || "USD", discountPct: 0, taxRate: 0, validUntil: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10) });
  const ai = async () => { setBusy(true); const r = await run(() => api<{ title: string; intro: string; lines: Line[]; terms: string }>("/api/quotes/draft", { json: { dealId: deal.id } })); setBusy(false); if (r) setEdit({ ...edit, ...r }); };
  const save = async () => { const json = { title: edit!.title, intro: edit!.intro, terms: edit!.terms, lines: (edit!.lines || []).filter((l) => l.description.trim()), currency: edit!.currency, discountPct: Number(edit!.discountPct) || 0, taxRate: Number(edit!.taxRate) || 0, validUntil: edit!.validUntil || null };
    if (await run(() => edit!.id ? api(`/api/quotes/${edit!.id}`, { method: "PATCH", json }) : api(`/api/deals/${deal.id}/quotes`, { json }), "Quote saved")) { setEdit(null); mutate(); } };
  const setLine = (i: number, p: Partial<Line>) => setEdit({ ...edit, lines: (edit!.lines || []).map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const can = perms.write;
  return <div className="quotes"><div className="q-h"><h3 className="section-h" style={{ margin: 0 }}>Quotes</h3>{can && <button type="button" className="btn sm" onClick={() => setEdit(blank())}>+ New quote</button>}</div>
    {(data?.quotes || []).length ? <ul className="q-list">{data!.quotes.map((q) => <li key={q.id}><div><b>{q.number}</b> {q.title} <span className="small muted">· {money(q.total, q.currency)}</span></div>
      <div className="small"><span className={"pill q-st-" + q.status}>{STATUS[q.status]}</span>{q.views ? ` · opened ${q.views} time${q.views === 1 ? "" : "s"}` : ""}{q.respondedBy ? ` · by ${q.respondedBy}` : ""}{q.sentTo.length ? ` · sent to ${q.sentTo.join(", ")}` : ""}</div>
      <div className="q-act"><a className="linkbtn small" href={`/api/quotes/${q.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
        {can && q.status !== "accepted" && <><button type="button" className="linkbtn small" onClick={() => setEdit(q)}>Edit</button>
          <button type="button" className="linkbtn small" onClick={() => setSend({ q, to: contact?.email || "", subject: `Quote ${q.number}: ${q.title}`, text: `Hi ${contact?.name?.split(" ")[0] || "there"},\n\nThank you for your time. Please find our quote attached for ${q.title}, valid until ${q.validUntil || "the date shown"}.\n\nHappy to walk you through it.\n\nBest regards,\n${m.me.name || ""}` })}>{q.status === "draft" ? "Send" : "Send again"}</button>
          <button type="button" className="linkbtn small" style={{ color: "var(--muted)" }} onClick={async () => { if (confirm(`Delete ${q.number}?`)) { await run(() => api(`/api/quotes/${q.id}`, { method: "DELETE" }), "Deleted"); mutate(); } }}>Delete</button></>}</div></li>)}</ul>
      : <p className="small muted" style={{ margin: 0 }}>No quotes yet.</p>}
    {edit && <Modal open label="Quote" onClose={() => setEdit(null)}><section className="ps-form q-editor dlg">
      <div className="wide q-h"><h3 style={{ margin: 0 }}>{edit.id ? `Edit ${edit.number}` : "New quote"} · {deal.name}</h3>{m.config.ai && <button type="button" className="btn sm" disabled={busy} onClick={ai}>✨ {busy ? "Drafting…" : "Draft with AI"}</button>}</div>
      <label className="wide">Title<input type="text" value={edit.title || ""} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
      <label className="wide">Introduction<textarea rows={4} value={edit.intro || ""} onChange={(e) => setEdit({ ...edit, intro: e.target.value })} /></label>
      <div className="wide q-lines">{(edit.lines || []).map((l, i) => <div key={i} className="q-line"><input type="text" aria-label="Description" placeholder="Description" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
        <input type="number" aria-label="Quantity" min="0" step="any" value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} /><input type="number" aria-label="Unit price" min="0" step="any" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} />
        <span className="num small">{money(l.qty * l.unitPrice, edit.currency)}</span><button type="button" className="linkbtn small" onClick={() => setEdit({ ...edit, lines: (edit.lines || []).filter((_, j) => j !== i) })}>✕</button></div>)}
        <button type="button" className="linkbtn small" onClick={() => setEdit({ ...edit, lines: [...(edit.lines || []), { description: "", qty: 1, unitPrice: 0 }] })}>+ Add a line</button></div>
      <label>Discount %<input type="number" min="0" max="100" step="any" value={edit.discountPct ?? 0} onChange={(e) => setEdit({ ...edit, discountPct: Number(e.target.value) })} /></label>
      <label>Tax %<input type="number" min="0" max="50" step="any" value={edit.taxRate ?? 0} onChange={(e) => setEdit({ ...edit, taxRate: Number(e.target.value) })} /></label>
      <label>Valid until<input type="date" value={edit.validUntil || ""} onChange={(e) => setEdit({ ...edit, validUntil: e.target.value })} /></label>
      <label>Currency<input type="text" maxLength={3} value={edit.currency || "USD"} onChange={(e) => setEdit({ ...edit, currency: e.target.value.toUpperCase() })} /></label>
      <label className="wide">Terms<textarea rows={3} value={edit.terms || ""} onChange={(e) => setEdit({ ...edit, terms: e.target.value })} /></label>
      <p className="wide q-total-line">Total <b>{money(t(edit), edit.currency)}</b></p>
      <div className="btns wide"><button type="button" className="btn primary" onClick={save}>Save quote</button><button type="button" className="btn ghost" onClick={() => setEdit(null)}>Cancel</button></div></section></Modal>}
    {send && <Modal open label="Send quote" onClose={() => setSend(null)}><section className="ps-form dlg">
      <h3 className="wide" style={{ margin: 0 }}>Send {send.q.number}</h3>
      <label className="wide">To<input type="text" value={send.to} onChange={(e) => setSend({ ...send, to: e.target.value })} /></label>
      <label className="wide">Subject<input type="text" value={send.subject} onChange={(e) => setSend({ ...send, subject: e.target.value })} /></label>
      <label className="wide">Message<textarea rows={7} value={send.text} onChange={(e) => setSend({ ...send, text: e.target.value })} /></label>
      <p className="small muted wide" style={{ margin: 0 }}>Sent from your email with the PDF attached and a link to view and accept it online. You're notified when they open or accept it.</p>
      <div className="btns wide"><button type="button" className="btn primary" disabled={!send.to.trim()} onClick={async () => { if (await run(() => api(`/api/quotes/${send.q.id}/send`, { json: { to: send.to.split(/[,;\s]+/).filter(Boolean), subject: send.subject, text: send.text } }), "Quote sent")) { setSend(null); mutate(); } }}>Send quote</button>
        <button type="button" className="btn ghost" onClick={() => setSend(null)}>Cancel</button></div></section></Modal>}
  </div>;
}
