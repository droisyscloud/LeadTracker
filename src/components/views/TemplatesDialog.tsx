"use client";
import { useState } from "react";
import { api, Modal, useData } from "../data";
import { PLACEHOLDERS, ago, userName } from "../model";
import { AiText } from "../AiText";

/** The team's shared email templates: anyone who sends email can add or improve one. */
export function TemplatesDialog({ onClose }: { onClose: () => void }) {
  const { m, run, perms } = useData();
  const [sel, setSel] = useState<string>(m.templates[0]?.id || "new");
  const t = m.templates.find((x) => x.id === sel);
  const [f, setF] = useState({ name: t?.name || "", subject: t?.subject || "", body: t?.body || "" });
  const pick = (id: string) => { const x = m.templates.find((y) => y.id === id); setSel(id); setF({ name: x?.name || "", subject: x?.subject || "", body: x?.body || "" }); };
  const insert = (ph: string) => setF({ ...f, body: f.body + ph });
  const save = async () => {
    if (!f.name.trim()) return;
    if (sel === "new") { const r = await run(() => api<{ id: string }>("/api/templates", { json: f }), "Template added"); if (r) setSel(r.id); }
    else await run(() => api(`/api/templates/${sel}`, { method: "PATCH", json: f }), "Template saved for the whole team");
  };
  const canDelete = t && (perms.manage || t.createdById === m.me.id);
  return <Modal open onClose={onClose} label="Email templates">
    <div className="dlg form dlg-wide">
      <header><h2>Email templates</h2><button className="btn ghost" onClick={onClose}>Close</button></header>
      <p className="small muted" style={{ margin: 0 }}>Shared with the whole team. Changes apply the next time someone picks the template.</p>
      <div className="tpl-grid">
        <ul className="tpl-list">
          {m.templates.map((x) => <li key={x.id}><button aria-current={sel === x.id} onClick={() => pick(x.id)}>{x.name}<br /><span className="small muted">{x.updatedById ? `edited by ${userName(m, x.updatedById)} ${ago(x.updatedAt)}` : "built in"}</span></button></li>)}
          <li><button aria-current={sel === "new"} onClick={() => { setSel("new"); setF({ name: "", subject: "", body: "Hi {first},\n\n\n\nBest regards,\n{me}\n{mycompany}" }); }}>+ New template</button></li>
        </ul>
        <div className="form">
          <label>Name<input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Product demo follow-up" /></label>
          <label>Subject<input type="text" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></label>
          <label>Message<AiText kind="email" rows={11} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
          <div><span className="small muted">Insert: </span>{PLACEHOLDERS.map(([ph, l]) => <button key={ph} type="button" className="chip" title={l} onClick={() => insert(ph)} style={{ marginRight: 4, marginBottom: 4 }}>{ph}</button>)}</div>
          <div className="btns"><button className="btn primary" disabled={!f.name.trim()} onClick={save}>{sel === "new" ? "Add template" : "Save changes"}</button>
            {canDelete && <button className="btn danger" onClick={async () => { if (confirm(`Delete "${t!.name}" for everyone?`) && await run(() => api(`/api/templates/${t!.id}`, { method: "DELETE" }), "Template deleted")) pick(m.templates.find((x) => x.id !== t!.id)?.id || "new"); }}>Delete</button>}</div>
        </div>
      </div>
    </div>
  </Modal>;
}
