"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ActivityDTO } from "@/lib/types";
import { api, Modal, useData } from "./data";
import { AiText } from "./AiText";
import { HtmlFrame } from "./EmailView";
import { CALL_OUT, userName } from "./model";
import { editable } from "@/lib/activityRules";
import { Linkify } from "./Linkify";

type Full = { body: string; html: string | null; subject: string; from: string | null; to: string[]; cc: string[]; at: number; files: { id: string; name: string; contentType: string; size: number; url: string }[] };
export const canEditActivity = (a: ActivityDTO, meId: string, manage: boolean, write: boolean) => write && editable(a) && (a.byId === meId || manage);

/** Text that folds to a few lines when long, with "Show more" (loading the rest if only a preview was sent). */
export function ClampText({ a, onFull }: { a: ActivityDTO; onFull: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false); const [over, setOver] = useState(false); const [text, setText] = useState(a.body); const [loading, setLoading] = useState(false);
  useEffect(() => setText(a.body), [a.body]);
  useLayoutEffect(() => { const el = ref.current; if (el) setOver(el.scrollHeight > el.clientHeight + 2); }, [text, open]);
  const more = async () => {
    if (a.truncated && text === a.body) { setLoading(true); try { const r = await api<Full>(`/api/activities/${a.id}`); setText(r.body); } finally { setLoading(false); } }
    setOpen(true);
  };
  return <>
    <div ref={ref} className={"body" + (open ? "" : " clamp")}><Linkify text={text} />{!open && a.truncated && text === a.body ? "…" : ""}</div>
    {(over || a.truncated || open) && <div className="clamp-tools">
      {open ? <button className="linkbtn small" onClick={() => setOpen(false)}>Show less</button> : <button className="linkbtn small" onClick={more} disabled={loading}>{loading ? "Loading…" : "Show more"}</button>}
      <button className="linkbtn small" onClick={onFull}>⤢ Full view</button>
    </div>}
  </>;
}

/** The whole entry in a large window: easy to read long notes, meeting minutes and emails. */
export function FullView({ a, label, onClose }: { a: ActivityDTO; label: string; onClose: () => void }) {
  const { m } = useData();
  const [f, setF] = useState<Full | null>(null); const [err, setErr] = useState("");
  useEffect(() => { api<Full>(`/api/activities/${a.id}`).then(setF).catch((e) => setErr(e.message)); }, [a.id]);
  return <Modal open onClose={onClose} label={label}><div className="dlg dlg-wide fullview">
    <header><div><h2>{label}</h2><div className="small muted">{a.byId ? userName(m, a.byId) : ""} · {new Date(a.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}{a.editedAt && <> · edited {new Date(a.editedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}{a.editedById && a.editedById !== a.byId ? ` by ${userName(m, a.editedById)}` : ""}</>}</div></div>
      <button className="btn ghost" onClick={onClose}>Close</button></header>
    {err ? <div className="banner">{err}</div> : !f ? <p className="muted">Loading…</p> : <>
      {(f.from || f.to.length > 0) && <div className="small muted">{f.from && <>From {f.from}</>}{f.to.length > 0 && <> · To {f.to.join(", ")}</>}{f.cc.length > 0 && <> · Cc {f.cc.join(", ")}</>}</div>}
      {f.subject && <h3 style={{ margin: "4px 0" }}>{f.subject}</h3>}
      {f.html ? <HtmlFrame html={f.html} images /> : <div className="fullview-text"><Linkify text={f.body} /></div>}
      {f.files.length > 0 && <div className="files">{f.files.map((x) => <a key={x.id} className="doc" href={x.url} target="_blank" rel="noopener">⎘ {x.name}</a>)}</div>}
    </>}
  </div></Modal>;
}

const local = (t: number | null) => { if (!t) return ""; const d = new Date(t); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
/** Change what was written in an entry. Saved with "edited" and who did it. */
export function EditActivity({ a, onDone }: { a: ActivityDTO; onDone: () => void }) {
  const { run } = useData();
  const [f, setF] = useState({ subject: a.subject, body: a.body, outcome: a.outcome || "connected", meetingAt: local(a.meetingAt), kind: a.kind || "" });
  const [ready, setReady] = useState(!a.truncated);
  useEffect(() => { if (a.truncated) api<Full>(`/api/activities/${a.id}`).then((r) => { setF((x) => ({ ...x, body: r.body })); setReady(true); }).catch(() => setReady(true)); }, [a.id, a.truncated]);
  const save = async () => {
    const json: Record<string, unknown> = { subject: f.subject, body: f.body };
    if (a.type === "call") json.outcome = f.outcome;
    if (a.type === "meeting" && a.origin !== "calendar") json.meetingAt = f.meetingAt ? new Date(f.meetingAt).getTime() : null;
    if (a.type === "request") json.kind = f.kind;
    if (await run(() => api(`/api/activities/${a.id}`, { method: "PATCH", json }), "Changes saved")) onDone();
  };
  return <div className="form edit-act">
    {a.type === "call" && <div className="inline" style={{ gap: 14 }}>{Object.entries(CALL_OUT).map(([k, l]) => <label key={k} style={{ flexDirection: "row", alignItems: "center", gap: 6, color: "var(--ink)" }}><input type="radio" style={{ width: "auto" }} checked={f.outcome === k} onChange={() => setF({ ...f, outcome: k })} />{l}</label>)}</div>}
    {a.type === "meeting" && a.origin !== "calendar" && <label>When<input type="datetime-local" value={f.meetingAt} onChange={(e) => setF({ ...f, meetingAt: e.target.value })} /></label>}
    {a.type === "request" && <label>What they asked for<input type="text" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} /></label>}
    {(a.subject || a.type === "email" || a.type === "meeting") && <label>Subject<input type="text" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></label>}
    <label>{a.type === "email" ? "Message" : "Details"}<AiText kind="note" rows={Math.min(16, Math.max(4, f.body.split("\n").length + 1))} value={f.body} disabled={!ready} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
    <div className="btns"><button className="btn primary" disabled={!ready} onClick={save}>Save changes</button><button className="btn ghost" onClick={onDone}>Cancel</button></div>
  </div>;
}
