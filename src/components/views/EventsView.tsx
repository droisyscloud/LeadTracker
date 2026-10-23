"use client";
import Link from "next/link";
import { useState } from "react";
import type { EventDTO } from "@/lib/types";
import { api, Modal, useData } from "../data";
import { Panel } from "../ui";
import { isOpenDeal, money, dv } from "../model";
import { AiText } from "../AiText";
import { LocationInput } from "../LocationInput";

function EventDialog({ ev, onClose }: { ev?: EventDTO; onClose: () => void }) {
  const { run } = useData();
  const [f, setF] = useState({ name: ev?.name || "", startDate: ev?.startDate || "", endDate: ev?.endDate || "", location: ev?.location || "", cost: String(ev?.cost || ""), notes: ev?.notes || "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const save = async (e: React.FormEvent) => { e.preventDefault();
    const json = { ...f, name: f.name.trim(), startDate: f.startDate || null, endDate: f.endDate || null, cost: Math.round(Number(f.cost.replace(/\D/g, "")) || 0) };
    if (await (ev ? run(() => api(`/api/events/${ev.id}`, { method: "PATCH", json }), "Event saved") : run(() => api("/api/events", { json }), "Event added"))) onClose(); };
  return <Modal open onClose={onClose} label="Event"><form className="dlg form" onSubmit={save}>
    <header><h2>{ev ? "Edit event" : "New event"}</h2><button type="button" className="btn ghost" onClick={onClose}>Close</button></header>
    <label>Name<input type="text" value={f.name} onChange={set("name")} required placeholder="ICE London 2027" /></label>
    <div className="two"><label>Start<input type="date" value={f.startDate} onChange={set("startDate")} /></label><label>End<input type="date" value={f.endDate} onChange={set("endDate")} /></label></div>
    <div className="two"><label>Location<LocationInput value={f.location} onChange={(v) => setF({ ...f, location: v })} /></label><label>Total cost (USD)<input type="text" inputMode="numeric" value={f.cost} onChange={set("cost")} /></label></div>
    <label>Notes<AiText kind="description" rows={3} value={f.notes} onChange={set("notes")} /></label>
    <div className="btns"><button className="btn primary">{ev ? "Save event" : "Add event"}</button></div>
  </form></Modal>;
}

export function EventsView() {
  const { m, run, perms } = useData();
  const [edit, setEdit] = useState<EventDTO | "new" | null>(null);
  const rows = m.events.map((e) => { const leads = m.contacts.filter((c) => c.eventId === e.id); const ids = new Set(leads.map((c) => c.id));
    const contacted = leads.filter((c) => m.stats.get(c.id)?.outbound).length; const meetings = leads.filter((c) => (m.stats.get(c.id)?.meetings || 0) > 0).length;
    const deals = m.deals.filter((d) => (d.contactId && ids.has(d.contactId)) || (d.companyId && leads.some((c) => c.companyId === d.companyId)));
    const pipe = deals.filter(isOpenDeal).reduce((n, d) => n + dv(d), 0), won = deals.filter((d) => d.stage === "won").reduce((n, d) => n + dv(d), 0);
    return { e, leads, contacted, meetings, pipe, won }; }).sort((a, b) => (b.e.startDate || "").localeCompare(a.e.startDate || ""));
  return <div className="grid">
    <div className="s12 inline" style={{ justifyContent: "flex-end" }}>{perms.manage && <button className="btn primary" onClick={() => setEdit("new")}>+ New event</button>}</div>
    <Panel className="s12" title="Events compared" sub="Tag leads with the event where you met them to see which shows pay off.">
      {rows.length ? <div style={{ overflowX: "auto" }}><table className="tbl"><thead><tr><th>Event</th><th className="n">Leads</th><th className="n">Contacted</th><th className="n">Meetings</th><th className="n">Open pipeline</th><th className="n">Won</th><th className="n">Cost</th><th className="n">Cost per lead</th><th /></tr></thead>
        <tbody>{rows.map(({ e, leads, contacted, meetings, pipe, won }) => <tr key={e.id}>
          <td><b>{e.name}</b><div className="small muted">{[e.location, e.startDate && (e.endDate && e.endDate !== e.startDate ? `${e.startDate} to ${e.endDate}` : e.startDate)].filter(Boolean).join(" · ")}</div></td>
          <td className="n"><Link className="colink" href={`/contacts?event=${e.id}`}>{leads.length}</Link></td><td className="n">{contacted}</td><td className="n">{meetings}</td>
          <td className="n">{money(pipe)}</td><td className="n">{money(won)}</td><td className="n">{e.cost ? money(e.cost) : "–"}</td><td className="n">{e.cost && leads.length ? money(Math.round(e.cost / leads.length)) : "–"}</td>
          <td className="n">{perms.manage && <><button className="linkbtn" onClick={() => setEdit(e)}>Edit</button>{!leads.length && <button className="linkbtn" style={{ marginLeft: 10, color: "var(--cold)" }} onClick={() => confirm(`Delete ${e.name}?`) && run(() => api(`/api/events/${e.id}`, { method: "DELETE" }), "Event deleted")}>Delete</button>}</>}</td></tr>)}</tbody></table></div>
        : <p className="empty">No events yet.</p>}
    </Panel>
    {edit && <EventDialog ev={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} />}
  </div>;
}
