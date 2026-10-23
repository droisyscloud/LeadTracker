"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ContactDTO } from "@/lib/types";
import { api, Modal, useData } from "../data";
import { companyKey, SOURCES } from "../model";
import { SelectAdd } from "../SelectAdd";
import { QuickCreate } from "../QuickCreate";
import { Portal } from "../Portal";
import { AiText } from "../AiText";
import { addTimelineNote } from "../timelineNote";
import { LinkedInTools, type LiFields } from "../LinkedIn";

export function ContactDialog({ contact, presetCompanyId, presetName, onClose, onCreated }: { contact?: ContactDTO; presetCompanyId?: string; presetName?: string; onClose: () => void; onCreated?: (c: ContactDTO) => void }) {
  const { m, run, perms } = useData();
  const router = useRouter();
  const preCo = presetCompanyId ? m.companyMap.get(presetCompanyId) : contact?.companyId ? m.companyMap.get(contact.companyId) : undefined;
  const [notes, setNotes] = useState(""); const [personal, setPersonal] = useState(!!contact?.personal || (typeof window !== "undefined" && !contact && new URLSearchParams(window.location.search).get("kind") === "personal"));
  const [f, setF] = useState({
    name: contact?.name || presetName || "", title: contact?.title || "", email: contact?.email || "", otherEmails: (contact?.otherEmails || []).join(", "), otherPhones: (contact?.otherPhones || []).join(", "), linkedinUrl: contact?.linkedinUrl || "", background: contact?.background || "", phone: contact?.phone || "",
    company: preCo?.name || "", website: preCo?.website || "", source: contact?.source || "Booth", referredBy: contact?.referredBy || "", eventId: contact?.eventId || "", teamId: contact?.teamId || (m.teams.filter((t) => t.memberIds.includes(m.me.id)).length === 1 ? m.teams.find((t) => t.memberIds.includes(m.me.id))!.id : ""),
  });
  const [products, setProducts] = useState<string[]>(contact?.productIds || []);
  const [busy, setBusy] = useState(false);
  const [newProduct, setNewProduct] = useState(false);
  const hit = useMemo(() => f.company.trim() ? m.companies.find((c) => companyKey(c.name) === companyKey(f.company)) : undefined, [f.company, m.companies]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  async function save(e: React.FormEvent) {
    e.preventDefault(); e.stopPropagation(); if (!f.name.trim()) return;
    if (!contact && f.email && m.contacts.some((x) => x.email && x.email === f.email.trim().toLowerCase()) && !confirm("A contact with this email already exists. Add anyway?")) return;
    setBusy(true);
    const payload = { ...f, ...(!contact || contact.createdById === m.me.id ? { personal } : {}), otherPhones: f.otherPhones.split(/[,;]+/).map((x) => x.trim()).filter(Boolean), otherEmails: f.otherEmails.split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => x.includes("@")), eventId: f.eventId || null, teamId: f.teamId || null, website: f.website || (hit?.website ?? ""), productIds: products };
    const r = contact
      ? await run(() => api(`/api/contacts/${contact.id}`, { method: "PATCH", json: payload }), "Contact updated")
      : await run(() => api<ContactDTO>("/api/contacts", { json: payload }), "Contact added");
    if (r && !contact && notes.trim()) await addTimelineNote((r as ContactDTO).id, notes.trim()).catch(() => undefined);
    setBusy(false);
    if (r) { onClose(); if (!contact) { if (onCreated) onCreated(r as ContactDTO); else router.push(`/contacts?id=${(r as ContactDTO).id}`); } }
  }
  async function remove() {
    if (!contact || !confirm(`Delete ${contact.name} and their whole history?`)) return;
    const r = await run(() => api(`/api/contacts/${contact.id}`, { method: "DELETE" }), "Moved to the recycle bin");
    if (r) { onClose(); router.push("/contacts"); }
  }
  const canDelete = contact && perms.del && (perms.manage || contact.createdById === m.me.id);
  return <Modal open onClose={onClose} label={contact ? "Edit contact" : "Add contact"}>
    <form className="dlg form" onSubmit={save}>
      <header><h2>{contact ? "Edit contact" : "Add contact"}</h2><button type="button" className="btn ghost" onClick={onClose}>Close</button></header>
      <label>Full name<input type="text" value={f.name} onChange={set("name")} required autoFocus /></label>
      <label>Job title<input type="text" value={f.title} onChange={set("title")} /></label>
      <div className="two">
        <label>Company<input type="text" list="co-list" value={f.company} onChange={set("company")} autoComplete="off" />
          <span className="small muted">{f.company.trim() ? (hit ? `Adds to existing company ${hit.name}` : "Creates a new company") : ""}</span></label>
        <label>Company website<input type="text" placeholder={hit?.website || "example.com"} value={f.website} onChange={set("website")} /></label>
      </div>
      <datalist id="co-list">{m.companies.map((c) => <option key={c.id} value={c.name} />)}</datalist>
      <div className="two"><label>Email<input type="email" value={f.email} onChange={set("email")} /></label><label>Phone<input type="tel" value={f.phone} onChange={set("phone")} /></label></div>
      <div className="li-row"><label>LinkedIn profile<input type="url" value={f.linkedinUrl} onChange={set("linkedinUrl")} placeholder="https://www.linkedin.com/in/…" /></label>
        <div className="btns"><LinkedInTools compact who={{ name: f.name, company: f.company, title: f.title, email: f.email }} onApply={(x: LiFields) => setF((v) => ({ ...v, linkedinUrl: x.linkedinUrl || v.linkedinUrl, background: x.background || v.background,
          name: v.name || x.name || "", title: v.title || x.title || "", company: v.company || x.company || "", email: v.email || x.email || "", phone: v.phone || x.phone || "" }))} /></div></div>
      {f.background && <label>Background <span className="muted small">(from LinkedIn or the web)</span><textarea rows={3} value={f.background} onChange={(e) => setF((v) => ({ ...v, background: e.target.value }))} /></label>}
      <label>Other emails <span className="muted small">(work, personal… emails and meetings with any of them land on this contact)</span><input type="text" value={f.otherEmails} onChange={set("otherEmails")} placeholder="jake.miller@gmail.com, jake@acmelogistics.com" /></label>
      <label>Other phone numbers <span className="muted small">(mobile, office… separate with commas)</span><input type="text" value={f.otherPhones} onChange={set("otherPhones")} placeholder="+1 702 555 0100, +1 702 555 0199" /></label>
      <div className="two"><label>Source<select value={f.source} onChange={set("source")}>{[...new Set([...SOURCES, f.source])].map((x) => <option key={x}>{x}</option>)}</select></label>
        <label>Event<SelectAdd kind="event" value={f.eventId} onChange={(v) => setF({ ...f, eventId: v })}><option value="">None</option>{m.events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</SelectAdd></label></div>
      {(m.teams.length > 0 || perms.manage) && <label>Team<SelectAdd kind="team" value={f.teamId} onChange={(v) => setF({ ...f, teamId: v })}><option value="">No team</option>{m.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</SelectAdd></label>}
      <label>Introduced by<input type="text" value={f.referredBy} onChange={set("referredBy")} placeholder="Who referred them (optional)" /></label>
      <label>Products of interest<div className="chips" style={{ marginTop: 0 }}>{m.products.map((p) => { const on = products.includes(p.id);
        return <button type="button" key={p.id} className="chip" aria-pressed={on} onClick={() => setProducts(on ? products.filter((x) => x !== p.id) : [...products, p.id])}>{p.name}</button>; })}
        {perms.manage && <button type="button" className="chip" onClick={() => setNewProduct(true)}>＋ New product</button>}</div></label>
      {newProduct && <Portal><QuickCreate kind="product" onClose={() => setNewProduct(false)} onCreated={(id) => setProducts((p) => [...p, id])} /></Portal>}
      {(!contact || contact.createdById === m.me.id) && <label className="chk" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><input type="checkbox" checked={personal} onChange={(e) => setPersonal(e.target.checked)} style={{ width: "auto" }} /> 🔒 Personal contact <span className="muted small">(only you will see it: nobody else, not even admins)</span></label>}
      {!contact && <label>Notes <span className="muted small">(saved on their timeline)</span><AiText kind="note" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Where you met, what they need, anything worth remembering" /></label>}
      <div className="btns"><button className="btn primary" disabled={busy}>{contact ? "Save changes" : "Add contact"}</button>
        {canDelete && <button type="button" className="btn danger" onClick={remove}>Delete contact</button>}</div>
    </form>
  </Modal>;
}
