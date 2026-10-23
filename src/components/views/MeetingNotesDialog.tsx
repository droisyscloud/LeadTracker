"use client";
import { useEffect, useRef, useState } from "react";
import type { ContactDTO, TaskPriority } from "@/lib/types";
import { api, Modal, useData } from "../data";
import { useRecorder } from "../thread";
import { STAGES, firstName, todayStr } from "../model";
import { AiText } from "../AiText";

type Suggest = { transcript: string; summary: string; keyPoints: string[]; tasks: { title: string; dueInDays: number; owner: string; priority: string }[]; followUpInDays: number | null; stage: string | null };
type Row = { on: boolean; title: string; dueDate: string; assigneeId: string; priority: TaskPriority };
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

/** Paste notes or record the meeting; AI drafts a summary and next steps; you review, then it saves to the timeline and creates tasks. */
export function MeetingNotesDialog({ c, onClose, voice = false }: { c: ContactDTO; onClose: () => void; voice?: boolean }) {
  const { m, run, toast } = useData();
  const [notes, setNotes] = useState(""); const [audio, setAudio] = useState<File | null>(null); const [kind, setKind] = useState<"meeting" | "call" | "note">(voice ? "note" : "meeting");
  const [busy, setBusy] = useState(false); const [s, setS] = useState<Suggest | null>(null);
  const [summary, setSummary] = useState(""); const [points, setPoints] = useState(""); const [rows, setRows] = useState<Row[]>([]);
  const [follow, setFollow] = useState(""); const [stageOn, setStageOn] = useState(true); const [keepTranscript, setKeepTranscript] = useState(true);
  const pick = useRef<HTMLInputElement>(null);
  // a voice note: recording starts as the window opens, and AI reads it as soon as you stop
  const auto = useRef(voice);
  const rec = useRecorder((f) => { setAudio(f); auto.current = false; });
  const started = useRef(false);
  useEffect(() => { if (voice && !started.current && m.config.transcribe) { started.current = true; rec.start(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const people = m.users.filter((u) => u.status === "active");
  const ownerId = (name: string) => people.find((u) => name && (u.name || "").toLowerCase() === name.toLowerCase())?.id
    || people.find((u) => name && (u.name || u.email).toLowerCase().includes(name.toLowerCase().split(" ")[0]))?.id || m.me.id;

  async function analyse() { return analyseWith(audio); }
  async function saveNow() { setBusy(true); const fd = new FormData(); fd.append("contactId", c.id); fd.append("kind", kind); fd.append("notes", notes); if (audio) fd.append("audio", audio);
    const r = await run(() => api("/api/ai/meeting/later", { form: fd }), audio ? "Saved. ✨ AI is transcribing it now; it'll appear on the timeline shortly." : "Saved. ✨ AI is writing it up now."); setBusy(false); if (r) onClose(); }
  async function analyseWith(file: File | null) {
    if (!notes.trim() && !file) { toast("Paste your notes or add a recording first.", "error"); return; }
    setBusy(true);
    const fd = new FormData(); fd.append("contactId", c.id); fd.append("notes", notes); if (file) fd.append("audio", file);
    try {
      const r = await api<Suggest>("/api/ai/meeting", { form: fd });
      setS(r); setSummary(r.summary); setPoints(r.keyPoints.join("\n"));
      setRows(r.tasks.map((t) => ({ on: true, title: t.title, dueDate: plusDays(t.dueInDays), assigneeId: ownerId(t.owner), priority: (t.priority as TaskPriority) || "normal" })));
      setFollow(r.followUpInDays != null ? plusDays(r.followUpInDays) : "");
    } catch (e) { toast(e instanceof Error ? e.message : "Could not read the notes.", "error"); }
    setBusy(false);
  }
  async function save() {
    const tasks = rows.filter((r) => r.on && r.title.trim()).map((r) => ({ title: r.title.trim(), dueDate: r.dueDate || null, assigneeId: r.assigneeId || null, priority: r.priority }));
    const r = await run(() => api("/api/ai/meeting/save", { json: { contactId: c.id, kind, summary, keyPoints: points.split("\n").map((x) => x.trim()).filter(Boolean),
      transcript: keepTranscript ? s?.transcript || "" : "", tasks, followUp: follow || null, stage: stageOn && s?.stage ? s.stage : null } }),
      `Notes saved${tasks.length ? ` and ${tasks.length} task${tasks.length > 1 ? "s" : ""} created` : ""}`);
    if (r) onClose();
  }
  const setRow = (i: number, p: Partial<Row>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const stageLabel = s?.stage ? STAGES.find((x) => x[0] === s.stage)?.[1] || s.stage : "";

  return <Modal open onClose={onClose} label="AI meeting notes"><div className="dlg form dlg-wide">
    <header><h2>{kind === "note" ? `Voice note for ${c.name}` : `Meeting notes for ${c.name}`}</h2><button className="btn ghost" onClick={onClose}>Close</button></header>
    {!s ? <>
      <div className="radios" role="radiogroup" aria-label="Type"><label><input type="radio" checked={kind === "meeting"} onChange={() => setKind("meeting")} />Meeting</label><label><input type="radio" checked={kind === "call"} onChange={() => setKind("call")} />Call</label><label><input type="radio" checked={kind === "note"} onChange={() => setKind("note")} />Note</label></div>
      <label>Your notes<AiText kind="note" rows={8} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={`Rough notes are fine, e.g.\n- ${firstName(c.name)} runs 40 locations, unhappy with current cash reconciliation\n- wants pricing by Friday, CFO signs off\n- send product demo video`} /></label>
      <div className="inline" style={{ flexWrap: "wrap" }}>
        <span className="small muted">Or a recording{m.config.transcribe ? "" : " (needs an OpenAI key)"}:</span>
        <input ref={pick} type="file" accept="audio/*,video/mp4,video/webm,.m4a,.mp3,.wav" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setAudio(f); e.target.value = ""; }} />
        <button type="button" className="btn" disabled={!m.config.transcribe} onClick={() => pick.current?.click()}>Upload recording</button>
        {typeof window !== "undefined" && "MediaRecorder" in window && (rec.recording
          ? <button type="button" className="btn danger" onClick={rec.stop}>■ Stop recording {Math.floor(rec.secs / 60)}:{String(rec.secs % 60).padStart(2, "0")}</button>
          : <button type="button" className="btn" disabled={!m.config.transcribe || rec.starting} onClick={rec.start}>{rec.starting ? (rec.slow ? "Allow the mic ↑" : "Starting…") : "● Record now"}</button>)}
        {audio && <span className="chip" aria-pressed="true">{audio.name} <button type="button" className="linkbtn" onClick={() => setAudio(null)}>×</button></span>}
      </div>
      {rec.recording && <div className="rec-live" aria-live="polite">● {rec.secs}s · {rec.live || "Listening… start speaking"}</div>}
      <p className="small muted" style={{ margin: 0 }}><b>Save now</b> and carry on: AI transcribes and writes it up on the timeline in the background, and lets you know when it's done. Or write it up now to review it and pick tasks first. Recordings up to about 20 minutes.</p>
      <div className="btns"><button className="btn primary" disabled={busy || rec.recording || (!notes.trim() && !audio)} onClick={saveNow}>Save now</button>
        <button className="btn" disabled={busy || rec.recording || (!notes.trim() && !audio)} onClick={analyse}>{busy ? (audio ? "Transcribing and reading…" : "Reading your notes…") : "✦ Summarise and suggest tasks"}</button></div>
    </> : <>
      <label>Summary (saved to the timeline)<AiText kind="summary" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} /></label>
      <label>Key points, one per line<AiText kind="summary" rows={4} value={points} onChange={(e) => setPoints(e.target.value)} /></label>
      <div><b>Follow-up tasks</b> <span className="small muted">untick any you don't want</span>
        <div style={{ overflowX: "auto", marginTop: 6 }}><table className="tbl"><thead><tr><th></th><th>Task</th><th>Owner</th><th>Due</th><th>Priority</th></tr></thead><tbody>
          {rows.map((r, i) => <tr key={i} style={{ opacity: r.on ? 1 : 0.5 }}>
            <td><input type="checkbox" checked={r.on} onChange={(e) => setRow(i, { on: e.target.checked })} aria-label="Create this task" /></td>
            <td style={{ minWidth: 240 }}><input type="text" value={r.title} onChange={(e) => setRow(i, { title: e.target.value })} /></td>
            <td><select value={r.assigneeId} onChange={(e) => setRow(i, { assigneeId: e.target.value })} style={{ width: "auto" }}>{people.map((u) => <option key={u.id} value={u.id}>{u.id === m.me.id ? "You" : u.name || u.email}</option>)}</select></td>
            <td><input type="date" min={todayStr()} value={r.dueDate} onChange={(e) => setRow(i, { dueDate: e.target.value })} /></td>
            <td><select value={r.priority} onChange={(e) => setRow(i, { priority: e.target.value as TaskPriority })} style={{ width: "auto" }}>{["urgent", "high", "normal", "low"].map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}</select></td>
          </tr>)}
          <tr><td colSpan={5}><button type="button" className="linkbtn" onClick={() => setRows([...rows, { on: true, title: "", dueDate: plusDays(3), assigneeId: m.me.id, priority: "normal" }])}>+ Add a task</button></td></tr>
        </tbody></table></div></div>
      <div className="two">
        <label>Next follow-up with {firstName(c.name)}<input type="date" min={todayStr()} value={follow} onChange={(e) => setFollow(e.target.value)} /></label>
        {s.stage && <label className="inline" style={{ alignItems: "center", gap: 8, marginTop: 24 }}><input type="checkbox" checked={stageOn} onChange={(e) => setStageOn(e.target.checked)} style={{ width: "auto" }} />Move the lead to <b>{stageLabel}</b></label>}
      </div>
      {s.transcript && <details><summary className="small">Transcript ({s.transcript.split(/\s+/).length} words)</summary><p className="small" style={{ whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}>{s.transcript}</p>
        <label className="inline small" style={{ gap: 6 }}><input type="checkbox" checked={keepTranscript} onChange={(e) => setKeepTranscript(e.target.checked)} style={{ width: "auto" }} />Save the transcript with the notes</label></details>}
      <p className="small muted" style={{ margin: 0 }}>Written by AI from your notes. Check names, numbers and dates before saving.</p>
      <div className="btns"><button className="btn primary" disabled={!summary.trim()} onClick={save}>Save notes{rows.filter((r) => r.on).length ? ` and create ${rows.filter((r) => r.on).length} task${rows.filter((r) => r.on).length > 1 ? "s" : ""}` : ""}</button>
        <button className="btn ghost" onClick={() => setS(null)}>Back</button></div>
    </>}
  </div></Modal>;
}
