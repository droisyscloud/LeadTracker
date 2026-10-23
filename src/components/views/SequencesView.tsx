"use client";
import Link from "next/link";
import { useState } from "react";
import type { SequenceDTO } from "@/lib/types";
import { api, Modal, useData } from "../data";
import { Panel } from "../ui";
import { ago } from "../model";
import { AiText } from "../AiText";

type Step = { dayOffset: number; subject: string; body: string };
function Editor({ seq, onClose }: { seq?: SequenceDTO; onClose: () => void }) {
  const { run } = useData();
  const [name, setName] = useState(seq?.name || "");
  const [steps, setSteps] = useState<Step[]>(seq?.steps || [{ dayOffset: 0, subject: "", body: "Hi {first},\n\n\n\nBest regards,\n{me}\n{mycompany}" }]);
  const up = (i: number, k: keyof Step, v: string | number) => setSteps(steps.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const save = async (e: React.FormEvent) => { e.preventDefault();
    const json = { name: name.trim(), steps: steps.map((s) => ({ ...s, dayOffset: Number(s.dayOffset) || 0 })) };
    const r = seq ? await run(() => api(`/api/sequences/${seq.id}`, { method: "PATCH", json }), "Sequence saved") : await run(() => api("/api/sequences", { json }), "Sequence created");
    if (r) onClose(); };
  return <Modal open onClose={onClose} label="Sequence"><form className="dlg form" onSubmit={save}>
    <header><h2>{seq ? "Edit sequence" : "New sequence"}</h2><button type="button" className="btn ghost" onClick={onClose}>Close</button></header>
    <label>Name<input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Event follow-up" /></label>
    <p className="small muted" style={{ margin: 0 }}>Use {"{first}"}, {"{name}"}, {"{company}"}, {"{me}"} and {"{mycompany}"}. Each step sends on its day after enrolment. Sending stops when the person replies or the lead is closed.</p>
    {steps.map((s, i) => <div key={i} className="panel" style={{ padding: 12, display: "grid", gap: 8 }}>
      <div className="inline" style={{ justifyContent: "space-between" }}><b>Step {i + 1}</b>
        <label className="small muted" style={{ flexDirection: "row", alignItems: "center", gap: 6, display: "flex" }}>Day <input type="text" inputMode="numeric" style={{ width: 64, flex: "0 0 auto" }} value={s.dayOffset} onChange={(e) => up(i, "dayOffset", e.target.value.replace(/\D/g, ""))} /></label>
        {steps.length > 1 && <button type="button" className="linkbtn" style={{ color: "var(--cold)" }} onClick={() => setSteps(steps.filter((_, j) => j !== i))}>Remove</button>}</div>
      <input type="text" aria-label="Subject" placeholder="Subject" value={s.subject} onChange={(e) => up(i, "subject", e.target.value)} required />
      <AiText kind="email" aria-label="Body" rows={6} value={s.body} onChange={(e) => up(i, "body", e.target.value)} required />
    </div>)}
    {steps.length < 10 && <button type="button" className="btn" onClick={() => setSteps([...steps, { dayOffset: (steps[steps.length - 1]?.dayOffset || 0) + 4, subject: "", body: "Hi {first},\n\n\n\nBest regards,\n{me}" }])}>+ Add step</button>}
    <div className="btns"><button className="btn primary">{seq ? "Save sequence" : "Create sequence"}</button></div>
  </form></Modal>;
}

export function SequencesView() {
  const { m, run, perms } = useData();
  const [edit, setEdit] = useState<SequenceDTO | "new" | null>(null);
  return <div className="grid">
    {!m.config.mail && <div className="s12 banner" style={{ margin: 0 }}>Sequences send email automatically, so they need email (SMTP) set up on the server first.</div>}
    <div className="s12 inline" style={{ justifyContent: "flex-end" }}>{perms.manage && <button className="btn primary" onClick={() => setEdit("new")}>+ New sequence</button>}</div>
    {m.sequences.map((s, si) => { const wide = si === m.sequences.length - 1 && m.sequences.length % 2 === 1; /* a lone last card takes the full row */ const en = m.enrollments.filter((e) => e.sequenceId === s.id); const active = en.filter((e) => e.status === "active");
      const replied = en.filter((e) => e.stoppedReason === "Replied").length;
      return <Panel key={s.id} className={wide ? "s12" : "s6"} title={<>{s.name} {!s.active && <span className="pill">Paused</span>}</>} sub={`${s.steps.length} emails over ${s.steps[s.steps.length - 1]?.dayOffset || 0} days · ${active.length} active · ${en.filter((e) => e.status === "completed").length} finished · ${replied} replied`}
        action={perms.manage && <span className="inline" style={{ gap: 12, flexWrap: "nowrap", whiteSpace: "nowrap" }}><button className="linkbtn" onClick={() => setEdit(s)}>Edit</button>
          <button className="linkbtn" onClick={() => run(() => api(`/api/sequences/${s.id}`, { method: "PATCH", json: { active: !s.active } }), s.active ? "Paused" : "Resumed")}>{s.active ? "Pause" : "Resume"}</button>
          <button className="linkbtn" style={{ color: "var(--cold)" }} onClick={() => confirm(`Delete ${s.name}? Active enrolments stop.`) && run(() => api(`/api/sequences/${s.id}`, { method: "DELETE" }), "Sequence deleted")}>Delete</button></span>}>
        <ol style={{ margin: "0 0 12px", paddingLeft: 20 }}>{s.steps.map((st, i) => <li key={i} className="small"><b>Day {st.dayOffset}</b> · <Fields text={st.subject} /></li>)}</ol>
        {en.length ? <table className="tbl"><thead><tr><th>Lead</th><th>Status</th><th>Next</th></tr></thead><tbody>{en.sort((a, b) => b.enrolledAt - a.enrolledAt).slice(0, 12).map((e) => { const c = m.contactMap.get(e.contactId);
          return <tr key={e.id}><td>{c ? <Link className="colink" href={`/contacts?id=${c.id}`}>{c.name}</Link> : "Deleted"}</td>
            <td className="small">{e.status === "active" ? `Step ${e.step + 1} of ${s.steps.length}` : e.status === "completed" ? "Finished" : `Stopped: ${e.stoppedReason}`}{e.lastError && <div style={{ color: "var(--cold)" }}>{e.lastError}</div>}</td>
            <td className="small muted">{e.status === "active" && e.nextAt ? (e.nextAt < Date.now() ? "Sending soon" : new Date(e.nextAt).toLocaleDateString()) : ago(e.enrolledAt)}
              {e.status === "active" && perms.write && <> · <button className="linkbtn" onClick={() => run(() => api(`/api/enrollments/${e.id}`, { method: "DELETE" }), "Stopped")}>Stop</button></>}</td></tr>; })}</tbody></table>
          : <p className="empty">Nobody enrolled yet. Open a lead and choose "Add to sequence".</p>}
      </Panel>; })}
    {!m.sequences.length && <Panel className="s12" title="No sequences yet"><p className="empty">A manager can create an automatic multi-email follow-up here.</p></Panel>}
    {edit && <Editor seq={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} />}
  </div>;
}

/** "{first}" shown as a highlighted "[first name]", so it's clear it gets filled in for each person. */
const FIELD: Record<string, string> = { first: "first name", name: "full name", company: "company", me: "your name" };
function Fields({ text }: { text: string }) {
  return <>{text.split(/(\{(?:first|name|company|me)\})/).map((part, i) => { const m = /^\{(\w+)\}$/.exec(part);
    return m ? <span key={i} className="seq-field">[{FIELD[m[1]]}]</span> : <span key={i}>{part}</span>; })}</>;
}
