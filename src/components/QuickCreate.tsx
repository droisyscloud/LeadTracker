"use client";
import { AiText } from "./AiText";
import { useState } from "react";
import { api, Modal, useData } from "./data";
import { LocationInput } from "./LocationInput";

export type NewKind = "company" | "product" | "event" | "team" | "contact";
export const LABEL: Record<NewKind, string> = { company: "company", product: "product", event: "event", team: "team", contact: "contact" };

/** A small form to add a company, product, event or team without leaving what you're doing. */
export function QuickCreate({ kind, initialName = "", onCreated, onClose }: { kind: Exclude<NewKind, "contact">; initialName?: string; onCreated?: (id: string) => void; onClose: () => void }) {
  const { run, toast } = useData();
  const [f, setF] = useState({ name: initialName, website: "", industry: "", location: "", startDate: "", endDate: "", description: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const [notes, setNotes] = useState("");
  const save = async (e: React.FormEvent) => {
    // stop here: this form may have been opened from inside another form
    e.preventDefault(); e.stopPropagation(); if (!f.name.trim()) return; setBusy(true);
    const name = f.name.trim();
    const call = kind === "company" ? () => api<{ id: string; existed: boolean; name: string }>("/api/companies", { json: { name, website: f.website, industry: f.industry, location: f.location, ...(notes.trim() ? { notes: notes.trim() } : {}) } })
      : kind === "product" ? () => api<{ id: string }>("/api/products", { json: { name, notes: notes.trim() } })
      : kind === "event" ? () => api<{ id: string }>("/api/events", { json: { name, location: f.location, startDate: f.startDate || null, endDate: f.endDate || f.startDate || null, ...(notes.trim() ? { notes: notes.trim() } : {}) } })
      : () => api<{ id: string }>("/api/teams", { json: { name, description: f.description, ...(notes.trim() ? { notes: notes.trim() } : {}) } });
    const r = await run(call);
    setBusy(false);
    if (r) {
      const existed = (r as { existed?: boolean }).existed;
      toast(existed ? `${(r as unknown as { name: string }).name} already existed, so that one was picked` : `${LABEL[kind][0].toUpperCase() + LABEL[kind].slice(1)} added`, existed ? "info" : "success");
      onCreated?.(r.id); onClose();
    }
  };
  return <Modal open onClose={onClose} label={`New ${LABEL[kind]}`}><form className="dlg form" onSubmit={save}>
    <header><h2>New {LABEL[kind]}</h2><button type="button" className="btn ghost" onClick={onClose}>Close</button></header>
    <label>Name<input type="text" value={f.name} onChange={set("name")} required autoFocus /></label>
    {kind === "company" && <><label>Website<input type="text" value={f.website} onChange={set("website")} placeholder="example.com" /></label>
      <div className="two"><label>Industry<input type="text" value={f.industry} onChange={set("industry")} placeholder="Slot route operator" /></label><label>Location<LocationInput value={f.location} onChange={(v) => setF({ ...f, location: v })} placeholder="Austin, TX" /></label></div></>}
    {kind === "event" && <><label>Location<LocationInput value={f.location} onChange={(v) => setF({ ...f, location: v })} placeholder="Austin, Texas" /></label>
      <div className="two"><label>Starts<input type="date" value={f.startDate} onChange={set("startDate")} /></label><label>Ends<input type="date" value={f.endDate} onChange={set("endDate")} /></label></div></>}
    {kind === "team" && <label>What this team covers<input type="text" value={f.description} onChange={set("description")} /></label>}
    <label>Notes<AiText kind="note" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering" /></label>
    <div className="btns"><button className="btn primary" disabled={busy || !f.name.trim()}>{busy ? "Adding…" : `Add ${LABEL[kind]}`}</button></div>
  </form></Modal>;
}

