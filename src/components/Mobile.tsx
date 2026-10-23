"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, useData } from "./data";
import { coName, isDue, STAGES, STAGE_LABEL, taskLeadIds, userName } from "./model";
import { useRecorder } from "./Voice";
import { Linkify } from "./Linkify";
import type { ActivityDTO, ContactDTO } from "@/lib/types";
import { BulkSelect } from "./BulkSelect";
import { SelectAdd } from "./SelectAdd";
import { NotesPin } from "./Stories";

/* The phone / tablet layout, WhatsApp-style, in the app's own colours. The desktop is unchanged. */
const initials = (n: string) => { const w = n.replace(/["'“”()]/g, " ").split(/\s+/).filter((x) => /^[\p{L}\p{N}]/u.test(x)); return ((w[0]?.[0] || "") + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase() || "?"; };
const stageColor = (s: string) => STAGES.find((x) => x[0] === s)?.[2] || "#93A3BC";
const inbound = (a: ActivityDTO) => a.type === "reply" || a.type === "request";
function when(ms: number) {
  const d = new Date(ms), now = new Date(); const sameDay = d.toDateString() === now.toDateString();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  if (now.getTime() - ms < 6 * 86400_000) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
function preview(a: ActivityDTO | undefined, me: string, m: ReturnType<typeof useData>["m"]) {
  if (!a) return "No activity yet";
  if (a.private) return "🔒 Email";
  const t = (a.subject || a.body || "").replace(/\s+/g, " ").trim();
  if (inbound(a)) return `They wrote: ${t}`;
  const who = a.byId === me ? "You" : userName(m, a.byId) || "Team";
  if (a.type === "call") return `☎ ${who}: call${a.outcome ? ` · ${a.outcome.replace("_", " ")}` : ""}`;
  if (a.type === "meeting") return `◷ Meeting${a.subject ? `: ${a.subject}` : ""}`;
  return `${who}: ${t || (a.files.length ? "📎 Attachment" : TYPE_WORD[a.type] || "")}`;
}
const TYPE_WORD: Record<string, string> = { email: "Email", note: "Note", file: "File", call: "Call", meeting: "Meeting" };

/** Leads as chats: newest activity first, with a mark for new replies. */
export function MobileLeads() {
  const { m, q: globalQ } = useData(); const router = useRouter();
  useEffect(() => { document.body.classList.add("in-leads"); return () => document.body.classList.remove("in-leads"); }, []);
  const [q, setQ] = useState(""); const [chip, setChip] = useState<"all" | "due" | "hot" | "replied" | "mine">("all"); const [coF, setCoF] = useState(""); const [limit, setLimit] = useState(80);
  const last = useMemo(() => { const mp = new Map<string, ActivityDTO>(); for (const a of m.activities) { const cur = mp.get(a.contactId); if (!cur || a.at > cur.at) mp.set(a.contactId, a); } return mp; }, [m.activities]);
  const list = useMemo(() => { const qq = (q || globalQ || "").toLowerCase().trim();
    return m.contacts.filter((c) => {
      if (qq && ![c.name, coName(m, c), c.email, c.title].join(" ").toLowerCase().includes(qq)) return false;
      if (coF && (coF === "none" ? !!c.companyId : c.companyId !== coF)) return false;
      const la = last.get(c.id);
      if (chip === "due") return isDue(m, c); if (chip === "hot") return (c.rating || 0) >= 4; if (chip === "mine") return c.ownerId === m.me.id;
      if (chip === "replied") return !!la && inbound(la);
      return true; }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })); }, [m, q, globalQ, chip, last, coF]);   // alphabetical
  const CH: [typeof chip, string][] = [["all", "All"], ["due", "Due"], ["replied", "New replies"], ["hot", "Hot"], ["mine", "Mine"]];
  return <div className="mleads">
    <div className="mleads-top"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads" aria-label="Search leads" />
      <div className="mchips" role="tablist">{CH.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={chip === k} className={"mchip" + (chip === k ? " on" : "")} onClick={() => setChip(k)}>{l}</button>)}</div>
      <SelectAdd kind="company" noNew label="Filter by company" value={coF} onChange={setCoF}><option value="">All companies</option><option value="none">No company</option>{[...m.companies].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</SelectAdd></div>
    <BulkSelect kind="contact" noun={["contact", "contacts"]} ids={list.map((x) => x.id)}><ul className="mlist">{list.slice(0, limit).map((c) => { const la = last.get(c.id); const newReply = !!la && inbound(la);
      return <li key={c.id}><button type="button" className="mrow" data-sel-id={c.id} onClick={() => router.push(`/contacts?id=${c.id}`)}>
        <span className="mav" style={{ background: `color-mix(in srgb, ${stageColor(c.status)} 28%, var(--panel-solid))`, color: stageColor(c.status) }}>{initials(c.name)}</span>
        <span className="mrow-m"><span className="mrow-n"><b>{c.name}</b>{coName(m, c) && <span className="muted"> · {coName(m, c)}</span>}</span>
          <span className={"mrow-p" + (newReply ? " new" : "")}>{preview(la, m.me.id, m)}</span></span>
        <span className="mrow-r"><span className={"mrow-t" + (newReply ? " new" : "")}>{la ? when(la.at) : ""}</span>{newReply ? <span className="mdot" aria-label="New reply">1</span> : isDue(m, c) ? <span className="mdue" title="Follow-up due">Due</span> : null}</span>
      </button></li>; })}</ul></BulkSelect>
    {list.length > limit && <button type="button" className="btn ghost mmore" onClick={() => setLimit(limit + 80)}>Show more ({list.length - limit})</button>}
    {!list.length && <p className="muted" style={{ padding: 16 }}>No leads match.</p>}
  </div>;
}

/** One lead as a conversation. "Details" opens the full lead page (edit, deals, tasks, everything). */
export function MobileChat({ c }: { c: ContactDTO }) {
  const { m, run, reload, perms, toast } = useData(); const router = useRouter(); const end = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [open, setOpen] = useState<Set<string>>(new Set()); const file = useRef<HTMLInputElement>(null); const r = useRecorder();
  const acts = useMemo(() => m.activities.filter((a) => a.contactId === c.id).sort((a, b) => a.at - b.at), [m.activities, c.id]);
  const tasks = m.tasks.filter((t) => !t.done && taskLeadIds(t).includes(c.id)).sort((a, b) => (a.dueDate || "9").localeCompare(b.dueDate || "9"));
  useEffect(() => { document.body.classList.add("in-chat"); return () => document.body.classList.remove("in-chat"); }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [acts.length]);
  const send = async (files?: File[]) => { const t = text.trim(); if ((!t && !files?.length) || busy) return; setBusy(true);
    const fd = new FormData(); fd.append("data", JSON.stringify({ contactId: c.id, type: "note", subject: "", body: t })); for (const f of files || []) fd.append("files", f);
    if (await run(() => api("/api/activities", { form: fd }), files?.length ? "Sent" : "Note added")) { setText(""); reload(); } setBusy(false); };
  const voice = async () => { if (r.state === "idle") { try { await r.start(); } catch { toast("Allow the microphone to record.", "error"); } return; }
    if (r.state !== "rec") return; const b = await r.stop(); r.setState("idle"); if (!b) return;
    const fd = new FormData(); fd.append("contactId", c.id); fd.append("kind", "note"); fd.append("notes", r.lastLive.current || ""); fd.append("audio", new File([b], `voice.${b.type.includes("mp4") ? "m4a" : "webm"}`, { type: b.type }));
    if (await run(() => api("/api/ai/meeting/later", { form: fd }), "Voice note saved. ✨ It's written up in the background.")) reload(); };
  let lastDay = "";
  return <div className="mchat">
    <header className="mchat-h"><button type="button" className="mback" onClick={() => router.push("/contacts")} aria-label="Back to leads">‹</button>
      <span className="mav" style={{ background: `color-mix(in srgb, ${stageColor(c.status)} 28%, var(--panel-solid))`, color: stageColor(c.status) }}>{initials(c.name)}</span>
      <button type="button" className="mchat-who" onClick={() => router.push(`/contacts?id=${c.id}&view=details`)}><b>{c.name}</b><span className="small muted">{[coName(m, c), STAGE_LABEL[c.status]].filter(Boolean).join(" · ")}</span></button>
      {c.phone && <a className="mic-btn" href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} aria-label={`Call ${c.name}`}>☎</a>}
      <button type="button" className="btn sm" onClick={() => router.push(`/contacts?id=${c.id}&view=details`)}>Details</button></header>
    {tasks.length > 0 && <Link href={`/tasks?id=${tasks[0].id}`} className="mpin">📌 {tasks.length} open task{tasks.length > 1 ? "s" : ""} · next: {tasks[0].title}{tasks[0].dueDate ? ` (${new Date(`${tasks[0].dueDate}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })})` : ""}</Link>}
    <NotesPin contactId={c.id} />
    <div className="mchat-body">
      {!acts.length && <p className="msys">No messages yet. Write a note, record a voice note, or send an email.</p>}
      {acts.map((a) => { const day = new Date(a.at).toDateString(); const sep = day !== lastDay ? (lastDay = day, <p key={a.id + "d"} className="msys">{when(a.at).includes(":") ? "Today" : new Date(a.at).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</p>) : null;
        if (a.type === "call" || a.type === "meeting") return [sep, <p key={a.id} className="msys">{a.type === "call" ? `☎ Call${a.outcome ? ` · ${a.outcome.replace("_", " ")}` : ""}` : `◷ ${a.subject || "Meeting"}${a.meetingAt ? ` · ${new Date(a.meetingAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}`}{a.body ? ` · ${a.body.slice(0, 80)}` : ""}</p>];
        const mine = !inbound(a); const long = (a.body || "").length > 320; const isOpen = open.has(a.id);
        return [sep, <div key={a.id} className={"mb " + (mine ? "out" : "in")}>
          {mine && a.byId && a.byId !== m.me.id && <span className="mb-who">{userName(m, a.byId)}</span>}
          {a.private ? <span className="muted">🔒 Private email</span> : <>
            {a.subject && <b className="mb-s">{a.type === "email" ? "✉ " : ""}{a.subject}</b>}
            {a.body && <span className="mb-t"><Linkify text={long && !isOpen ? a.body.slice(0, 320) + "…" : a.body} /></span>}
            {long && <button type="button" className="linkbtn small" onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })}>{isOpen ? "Less" : "Read more"}</button>}
            {[...a.files, ...a.mailFiles].map((f) => <a key={f.id} className="mb-f" href={`/api/files/${f.id}`}>📎 {f.name}</a>)}</>}
          <span className="mb-time">{new Date(a.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}{a.type === "email" && mine ? (a.openedAt ? " · ✓✓ opened" : a.delivery === "sent" ? " · ✓ sent" : "") : ""}</span>
        </div>]; })}
      <div ref={end} />
    </div>
    {perms.write && <div className="mcomp">
      {r.state === "rec" ? <div className="mrec" ref={(e) => { if (e) e.scrollTop = e.scrollHeight; }}><b>● {r.secs}s</b> {r.live || "Listening… start speaking"}</div> : <>
        <button type="button" className="mic-btn" onClick={() => file.current?.click()} aria-label="Attach a file">📎</button>
        <input ref={file} type="file" multiple hidden onChange={(e) => { const fs = [...(e.target.files || [])]; e.target.value = ""; if (fs.length) send(fs); }} />
        <textarea rows={1} value={text} onChange={(e) => { setText(e.target.value); e.target.style.height = "40px"; e.target.style.height = Math.min(120, e.target.scrollHeight) + "px"; }} placeholder="Write a note…" aria-label="Write a note" />
        <button type="button" className="mic-btn" onClick={() => router.push(`/contacts?id=${c.id}&view=details&do=email`)} aria-label="Write an email">✉</button></>}
      {text.trim() && r.state !== "rec" ? <button type="button" className="msend" onClick={() => send()} disabled={busy} aria-label="Save note">➤</button>
        : <button type="button" className={"msend" + (r.state === "rec" ? " rec" : "")} onClick={voice} aria-label={r.state === "rec" ? "Stop and save the voice note" : "Record a voice note"}>{r.state === "rec" ? "■" : r.state === "starting" ? "…" : "🎙"}</button>}
    </div>}
  </div>;
}

/** The "+" button on phones: one place to add anything. */
export function MobilePlus() {
  const { perms } = useData(); const [open, setOpen] = useState(false);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [open]);
  if (!perms.write) return null;
  const go = (ev: string, detail?: string) => { setOpen(false); window.dispatchEvent(new CustomEvent(ev, { detail })); };
  const A: [string, string, () => void][] = [["📸", "Photo", () => go("lt:addnote")], ["🪪", "Card", () => go("lt:addnote")], ["🎙", "Voice", () => go("lt:addnote")],
    ["👤", "Lead", () => go("lt:new", "contact")], ["✓", "Task", () => go("lt:new", "task")], ["📝", "Note", () => go("lt:addnote")]];
  return <>
    <button type="button" className="mplus" onClick={() => setOpen(true)} aria-label="Add">＋</button>
    {open && <div className="msheet-bg" onClick={() => setOpen(false)}><div className="msheet" role="dialog" aria-label="Add" onClick={(e) => e.stopPropagation()}>
      <b>Add</b><div className="msheet-g">{A.map(([i, l, f]) => <button key={l} type="button" className="msheet-a" onClick={f}><span>{i}</span>{l}</button>)}</div>
      <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button></div></div>}
  </>;
}
