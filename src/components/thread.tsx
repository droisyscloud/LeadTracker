"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import type { TaskCommentDTO, TaskFileDTO } from "@/lib/types";
import { api, useData } from "./data";
import { Avatar, Icon } from "./ui";
import { ago, userName } from "./model";
import { AiText } from "./AiText";
import { Linkify } from "./Linkify";
import { openMic, useHear } from "./LiveText";

export const fmtSize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export function Attachment({ f }: { f: TaskFileDTO }) {
  const url = `/api/files/${f.id}`;
  if (/^image\/(png|jpeg|gif|webp)$/.test(f.contentType)) return <a className="att-img" href={url} target="_blank" rel="noreferrer"><img src={url} alt={f.name} loading="lazy" /></a>;
  if (f.contentType.startsWith("audio/")) return <div className="att-media"><audio controls preload="metadata" src={url} /><a className="small muted" href={`${url}?download=1`}>{f.name} · {fmtSize(f.size)}</a></div>;
  if (/^video\/(mp4|webm|quicktime)$/.test(f.contentType)) return <div className="att-media"><video controls preload="metadata" src={url} /><a className="small muted" href={`${url}?download=1`}>{f.name} · {fmtSize(f.size)}</a></div>;
  const ext = (f.name.split(".").pop() || "file").slice(0, 4).toUpperCase();
  return <a className="att-file" href={f.contentType === "application/pdf" ? url : `${url}?download=1`} target="_blank" rel="noreferrer"><span className="att-ext">{ext}</span><span><b>{f.name}</b><br /><span className="small muted">{fmtSize(f.size)}</span></span></a>;
}

export function renderBody(body: string, mentionIds: string[], names: Map<string, string>) {
  const tags = mentionIds.map((id) => names.get(id)).filter(Boolean) as string[];
  if (!tags.length) return <Linkify text={body} />;
  const re = new RegExp(`(@(?:${tags.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "g");
  return body.split(re).map((part, i) => (re.test(part) ? <span key={i} className="mention">{part}</span> : <Linkify key={i} text={part} />));
}

/** Uploads with a progress bar, so a large video doesn't look frozen. */
export function postForm(url: string, form: FormData, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest(); x.open("POST", url);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    x.onload = () => { if (x.status >= 200 && x.status < 300) resolve(); else { let msg = `Upload failed (${x.status})`; try { msg = JSON.parse(x.responseText).error || msg; } catch { /* keep */ } reject(new Error(msg)); } };
    x.onerror = () => reject(new Error("Network error. Check your connection and try again."));
    x.send(form);
  });
}

export function useRecorder(onDone: (f: File) => void) {
  const [rec, setRec] = useState<MediaRecorder | null>(null); const [starting, setStarting] = useState(false); const [slow, setSlow] = useState(false); const busy = useRef(false); const [secs, setSecs] = useState(0); const live = useHear();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null); const chunks = useRef<Blob[]>([]); const mime = useRef("audio/webm");
  const start = async () => {
    if (busy.current) return; busy.current = true; setStarting(true);   // one tap starts it; extra taps are ignored
    try {
      const stream = await openMic(() => setSlow(true));
      const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined); chunks.current = []; mime.current = (r.mimeType || type || "audio/webm").split(";")[0];
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => { stream.getTracks().forEach((t) => t.stop()); const ext = mime.current.includes("mp4") ? "m4a" : "webm"; busy.current = false;
        onDone(new File(chunks.current, `voice-note-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${ext}`, { type: mime.current })); };
      r.start(1000); setRec(r); setSecs(0); timer.current = setInterval(() => setSecs((s) => s + 1), 1000);
      live.start(() => (chunks.current.length ? new Blob(chunks.current, { type: mime.current }) : null));
    } catch (e) { busy.current = false; alert(e instanceof Error ? e.message : "Couldn't start the microphone."); }   // never stuck on "Starting…"
    finally { setStarting(false); setSlow(false); }
  };
  const stop = () => { live.stop(); rec?.stop(); setRec(null); if (timer.current) clearInterval(timer.current); };
  return { recording: !!rec, starting, slow, secs, start, stop, live: live.text, liveOk: live.supported };
}

export function Composer({ postUrl, extra, onSent, canReply, placeholder, readOnlyNote }: { postUrl: string; extra?: Record<string, unknown>; onSent: () => void; canReply: boolean; placeholder?: string; readOnlyNote?: string }) {
  const { m, toast } = useData();
  const [text, setText] = useState(""); const [files, setFiles] = useState<File[]>([]); const [mentions, setMentions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [pct, setPct] = useState(0); const [suggest, setSuggest] = useState<string | null>(null); const [drag, setDrag] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null); const pick = useRef<HTMLInputElement>(null);
  // copy first: the browser empties a FileList as soon as the input is reset
  const addFiles = (l: FileList | File[]) => { const arr = Array.from(l); setFiles((p) => [...p, ...arr].slice(0, 20)); };
  const rec = useRecorder((f) => setFiles((p) => [...p, f]));
  const people = m.users.filter((u) => u.status === "active" && u.id !== m.me.id);
  const onInput = (v: string) => {
    setText(v);
    const caret = ta.current?.selectionStart ?? v.length;
    const mt = v.slice(0, caret).match(/(?:^|\s)@([\w.-]{0,30})$/);
    setSuggest(mt ? mt[1].toLowerCase() : null);
  };
  const choose = (id: string) => {
    const u = m.userMap.get(id); if (!u || !ta.current) return;
    const caret = ta.current.selectionStart; const before = text.slice(0, caret).replace(/@[\w.-]*$/, `@${u.name || u.email} `);
    setText(before + text.slice(caret)); setMentions((p) => [...new Set([...p, id])]); setSuggest(null);
    setTimeout(() => { ta.current?.focus(); ta.current?.setSelectionRange(before.length, before.length); }, 0);
  };
  const matches = suggest !== null ? people.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(suggest)).slice(0, 6) : [];
  const send = async () => {
    if (!text.trim() && !files.length) return;
    const used = mentions.filter((id) => { const u = m.userMap.get(id); return u && text.includes(`@${u.name || u.email}`); });
    const fd = new FormData(); fd.append("data", JSON.stringify({ ...(extra || {}), body: text, mentionIds: used })); files.forEach((f) => fd.append("files", f));
    setBusy(true); setPct(0);
    try { await postForm(postUrl, fd, setPct); setText(""); setFiles([]); setMentions([]); onSent(); toast(used.length ? `Reply sent. ${used.length} ${used.length === 1 ? "person" : "people"} notified.` : "Reply sent"); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not send the reply.", "error"); }
    setBusy(false);
  };
  if (!canReply) return <p className="small muted">{readOnlyNote || "You can read this, but not reply."}</p>;
  return <div className={"composer" + (drag ? " drag" : "")} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
    onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}>
    <div style={{ position: "relative" }}>
      <AiText kind="comment" ref={ta} rows={3} value={text} placeholder={placeholder || "Reply, or type @ to mention someone. Drop or paste files here."} aria-label="Reply"
        onChange={(e) => onInput(e.target.value)} onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }}
        onKeyDown={(e) => { if (matches.length && (e.key === "Enter" || e.key === "Tab")) { e.preventDefault(); choose(matches[0].id); } else if (e.key === "Escape") setSuggest(null); else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }} />
      {matches.length > 0 && <div className="picker-list" style={{ position: "absolute", left: 0, top: "100%", zIndex: 5, minWidth: 260 }}>{matches.map((u) =>
        <button type="button" key={u.id} onMouseDown={(e) => { e.preventDefault(); choose(u.id); }}><Avatar name={u.name || u.email} image={u.image} size={22} /><span>{u.name || u.email}<br /><span className="small muted">{u.email}</span></span></button>)}</div>}
    </div>
    {files.length > 0 && <div className="chips" style={{ marginTop: 8 }}>{files.map((f, i) => <span key={i} className="chip" aria-pressed="true">{f.name} · {fmtSize(f.size)} <button type="button" className="linkbtn" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>×</button></span>)}</div>}
    {busy && files.length > 0 && <div className="progress"><i style={{ width: `${pct}%` }} /><span className="small muted">Uploading {pct}%</span></div>}
    <div className="inline" style={{ justifyContent: "space-between", marginTop: 8 }}>
      <div className="inline">
        <input ref={pick} type="file" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        <button type="button" className="btn" onClick={() => pick.current?.click()}><Icon name="clip" size={16} /> Attach</button>
        {typeof window !== "undefined" && "MediaRecorder" in window && (rec.recording
          ? <button type="button" className="btn danger" onClick={rec.stop}>■ Stop {Math.floor(rec.secs / 60)}:{String(rec.secs % 60).padStart(2, "0")}</button>
          : <button type="button" className="btn" onClick={rec.start}><Icon name="mic" size={16} /> Voice note</button>)}
        {rec.recording && <div className="rec-live" aria-live="polite">{rec.live || (rec.liveOk ? "Listening…" : "Recording…")}</div>}
        <button type="button" className="btn ghost" onClick={() => { const v = text + (text && !text.endsWith(" ") ? " " : "") + "@"; setText(v); setSuggest(""); ta.current?.focus(); }}><Icon name="at" size={16} /> Mention</button>
      </div>
      <button type="button" className="btn primary" disabled={busy || rec.recording || (!text.trim() && !files.length)} onClick={send}><Icon name="send" size={16} /> {busy ? "Sending…" : "Send reply"}</button>
    </div>
    <p className="small muted" style={{ margin: "6px 0 0" }}>Images, voice notes, audio, video, PDF, Word, Excel and PowerPoint up to {m.config.taskMaxUploadMb} MB each. Ctrl or ⌘ + Enter sends.</p>
  </div>;
}


/** One conversation: replies with attachments and the occasional logged change. Used by tasks and discussions. */
export function ThreadView({ items, onDelete, onEdited, editUrl }: { items: TaskCommentDTO[]; onDelete: (id: string) => void; onEdited?: () => void; editUrl?: (id: string) => string }) {
  const { run } = useData(); const [editId, setEditId] = useState<string | null>(null); const [draft, setDraft] = useState("");
  const { m } = useData();
  const names = useMemo(() => new Map(m.users.map((u) => [u.id, u.name || u.email])), [m.users]);
  return <>{items.map((c) => c.kind === "event"
    ? <div key={c.id} className="t-event"><b>{userName(m, c.authorId)}</b> {c.body} · <span title={new Date(c.createdAt).toLocaleString()}>{ago(c.createdAt)}</span></div>
    : <div key={c.id} className="t-msg">
      <Avatar name={names.get(c.authorId || "") || "?"} image={c.authorId ? m.userMap.get(c.authorId)?.image : null} size={30} />
      <div className="t-bubble">
        <div className="small"><span className="kbadge k-team">Internal</span> <b>{c.authorId === m.me.id ? "You" : userName(m, c.authorId)}</b> <span className="muted" title={new Date(c.createdAt).toLocaleString()}>{ago(c.createdAt)}{c.editedAt ? " · edited" : ""}</span>
          <span className="t-acts">{editId !== c.id && (c.authorId === m.me.id || m.me.role === "admin") && <button type="button" className="linkbtn" onClick={() => { setEditId(c.id); setDraft(c.body); }}>Edit</button>}
            {(c.authorId === m.me.id || m.me.role === "admin" || m.me.role === "manager") && <button type="button" className="linkbtn" onClick={() => onDelete(c.id)}>Delete</button>}</span></div>
        {editId === c.id ? <div className="t-edit"><textarea rows={Math.min(10, Math.max(3, draft.split("\n").length + 1))} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Edit" autoFocus />
          <div className="btns"><button type="button" className="btn sm primary" disabled={!draft.trim()} onClick={async () => { if (await run(() => api(editUrl ? editUrl(c.id) : `/api/comments/${c.id}`, { method: "PATCH", json: { body: draft } }), "Saved")) { setEditId(null); onEdited?.(); } }}>Save</button>
            <button type="button" className="btn sm ghost" onClick={() => setEditId(null)}>Cancel</button></div></div>
        : c.body && <div className="t-text">{renderBody(c.body, c.mentionIds, names)}{c.editedAt ? <span className="small muted"> · edited</span> : null}</div>}

        {c.files.length > 0 && <div className="att-grid">{c.files.map((f) => <Attachment key={f.id} f={f} />)}</div>}
      </div>
    </div>)}</>;
}

/** Team discussion on a lead, deal or company: internal comments with @mentions and attachments. */
export function Discussion({ type, id, compact = false }: { type: "contact" | "deal" | "company"; id: string; compact?: boolean }) {
  const { m, run } = useData();
  const key = `/api/comments?type=${type}&id=${id}`;
  const { data, mutate } = useSWR<{ comments: TaskCommentDTO[] }>(key, (u: string) => api<{ comments: TaskCommentDTO[] }>(u), { refreshInterval: 20000 });
  const canPost = m.me.role !== "viewer" || !!data?.comments.some((c) => c.mentionIds.includes(m.me.id));
  const end = useRef<HTMLDivElement>(null);
  const sent = useCallback(async () => { await mutate(); setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50); }, [mutate]);
  const label = type === "contact" ? "this lead" : type === "deal" ? "this deal" : "this company";
  return <div className="discussion">
    {!data ? <p className="small muted">Loading…</p> : data.comments.length ? <div className="thread" style={{ borderTop: 0, paddingTop: 0, marginTop: 0, maxHeight: compact ? 320 : 520, overflow: "auto" }}>
      <ThreadView items={data.comments} onEdited={() => mutate()} onDelete={async (cid) => { if (confirm("Delete this comment?") && await run(() => api(`/api/comments/${cid}`, { method: "DELETE" }), "Comment deleted")) mutate(); }} /><div ref={end} /></div>
      : <p className="small muted" style={{ margin: "0 0 10px" }}>No comments yet. Ask a colleague something about {label} with @, for example "@Priya can you call him before Friday?" Only your team sees this, never the customer.</p>}
    <Composer postUrl="/api/comments" extra={{ entityType: type, entityId: id }} onSent={sent} canReply={canPost}
      placeholder={`Comment for the team, @ to mention someone. Not sent to the customer.`} readOnlyNote="Viewers can reply once someone mentions them here." />
  </div>;
}
