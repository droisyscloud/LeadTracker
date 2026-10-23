"use client";
import { useState } from "react";
import { api, useData } from "./data";

const same = (a: Record<string, string>, b: Record<string, string>) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => (a[k] || "") === (b[k] || ""));
};

/** Saved filter combinations: one click to open, save the current filters as a new view, share with the team. */
export function ViewsBar({ page, filters, defaults, apply, hideAll = false }: { page: "contacts" | "deals"; filters: Record<string, string>; defaults: Record<string, string>; apply: (f: Record<string, string>) => void; hideAll?: boolean }) {
  const { m, run, perms } = useData();
  const views = m.views.filter((v) => v.page === page);
  const [saving, setSaving] = useState(false); const [name, setName] = useState(""); const [shared, setShared] = useState(false);
  const changed = !same(filters, defaults);
  const active = views.find((v) => same({ ...defaults, ...v.filters }, filters));
  const save = async () => {
    const diff = Object.fromEntries(Object.entries(filters).filter(([k, v]) => v !== defaults[k] && v !== ""));
    if (await run(() => api("/api/views", { json: { page, name: name.trim(), filters: diff, shared } }), shared ? "View saved and shared with the team" : "View saved")) { setSaving(false); setName(""); setShared(false); }
  };
  // nothing to show yet: no saved views and nothing to save
  if (hideAll && !views.length && !changed && !saving) return null;
  return <div className="views">
    {!hideAll && <button type="button" className="chip" aria-pressed={!changed} onClick={() => apply(defaults)}>All</button>}
    {views.map((v) => <span key={v.id} className="view-chip">
      <button type="button" className="chip" aria-pressed={active?.id === v.id} onClick={() => apply({ ...defaults, ...v.filters })} title={v.shared ? "Shared with the team" : "Only you"}>{v.shared ? "👥 " : ""}{v.name}</button>
      {(v.createdById === m.me.id || (v.shared && perms.manage)) && <button type="button" className="view-x" aria-label={`Delete ${v.name}`} onClick={() => { if (confirm(`Delete the view "${v.name}"${v.shared ? " for everyone" : ""}?`)) run(() => api(`/api/views/${v.id}`, { method: "DELETE" }), "View deleted"); }}>×</button>}
    </span>)}
    {changed && !active && !saving && <button type="button" className="linkbtn small" onClick={() => setSaving(true)}>+ Save these filters as a view</button>}
    {saving && <span className="view-save">
      <input type="text" autoFocus placeholder={page === "contacts" ? "e.g. My hot leads from the spring expo" : "e.g. Closing this quarter"} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && save()} aria-label="View name" />
      {m.me.role !== "viewer" && <label className="small" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} style={{ width: "auto" }} />Share with team</label>}
      <button type="button" className="btn primary" disabled={!name.trim()} onClick={save}>Save</button><button type="button" className="btn ghost" onClick={() => setSaving(false)}>Cancel</button>
    </span>}
  </div>;
}
