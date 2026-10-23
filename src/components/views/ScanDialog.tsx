"use client";
import { useRef, useState } from "react";
import { api, Modal, useData } from "../data";

type Lead = { name: string; title: string; company: string; email: string; phone: string; website: string; pick: boolean; dup: boolean };

export function ScanDialog({ onClose }: { onClose: () => void }) {
  const { m, run, toast } = useData();
  const inp = useRef<HTMLInputElement>(null); const cam = useRef<HTMLInputElement>(null);
  const [eventId, setEventId] = useState(m.events[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const emails = new Set(m.contacts.map((c) => c.email).filter(Boolean));
  async function read() {
    const fs = [...Array.from(inp.current?.files || []), ...Array.from(cam.current?.files || [])]; if (!fs.length) { toast("Choose one or more images first.", "error"); return; }
    setBusy(true);
    try {
      const fd = new FormData(); fs.forEach((f) => fd.append("images", f));
      const r = await api<{ leads: Omit<Lead, "pick" | "dup">[] }>("/api/ai/scan", { form: fd });
      setLeads(r.leads.map((l) => { const dup = !!l.email && emails.has(l.email.toLowerCase()); return { ...l, dup, pick: !dup }; }));
    } catch (e) { toast(e instanceof Error ? e.message : "Could not read the images.", "error"); }
    setBusy(false);
  }
  async function save() {
    const picks = (leads || []).filter((l) => l.pick).map(({ pick: _p, dup: _d, ...l }) => l);
    if (!picks.length) return;
    setBusy(true);
    const r = await run(() => api<{ created: number; skipped: string[] }>("/api/contacts/import", { json: { leads: picks, source: "Booth", eventId: eventId || null } }));
    setBusy(false);
    if (r) { toast(`${r.created} imported${r.skipped.length ? `, ${r.skipped.length} already existed` : ""}`); onClose(); }
  }
  const upd = (i: number, k: keyof Lead, v: string | boolean) => setLeads((ls) => ls!.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  return <Modal open onClose={onClose} label="Import from badge screenshots">
    <div className="dlg form">
      <header><h2>Scan badges or business cards</h2><button className="btn ghost" onClick={onClose}>Close</button></header>
      <p className="muted" style={{ margin: 0 }}>Take a photo of a badge or business card, or pick screenshots from a badge-scanner app. Review the details, then import. People from the same company are grouped automatically.</p>
      <div className="two"><label>Take a photo<input ref={cam} type="file" accept="image/*" capture="environment" /></label><label>Or choose images<input ref={inp} type="file" accept="image/png,image/jpeg,image/webp" multiple /></label></div>
      <label>Event<select value={eventId} onChange={(e) => setEventId(e.target.value)}><option value="">None</option>{m.events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
      <div className="btns"><button className="btn primary" disabled={busy} onClick={read}>{busy && !leads ? "Reading…" : "Read images"}</button></div>
      {leads && <div className="scanlist">{leads.length ? leads.map((l, i) => <div className="scanitem" key={i}>
        <input type="checkbox" checked={l.pick} onChange={(e) => upd(i, "pick", e.target.checked)} aria-label={"Import " + l.name} />
        <div><div className="g">{(["name", "company", "title", "email", "phone", "website"] as const).map((k) => <input key={k} type="text" aria-label={k} placeholder={k} value={l[k]} onChange={(e) => upd(i, k, e.target.value)} />)}</div>
          {l.dup && <div className="small" style={{ color: "var(--cold)", marginTop: 4 }}>Already in the tracker</div>}</div></div>) : <p className="empty">No contacts found in those screenshots.</p>}</div>}
      {leads && leads.length > 0 && <div className="btns"><button className="btn primary" disabled={busy} onClick={save}>Import selected</button></div>}
    </div>
  </Modal>;
}
