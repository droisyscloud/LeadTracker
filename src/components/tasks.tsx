"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import type { TaskCommentDTO, TaskDTO, TaskPriority, TaskRepeat, TaskStatus } from "@/lib/types";
import { api, Modal, useData } from "./data";
import { Avatar } from "./ui";
import { Composer, ThreadView } from "./thread";
import { SelectAdd } from "./SelectAdd";
import { ago, taskOverdue, todayStr, userName, taskLeadIds, taskCompanyIds, niceDate } from "./model";
import { AiText } from "./AiText";
import { Linkify } from "./Linkify";

export const STATUS: { id: TaskStatus; label: string; color: string }[] = [
  { id: "todo", label: "To do", color: "var(--muted)" },
  { id: "in_progress", label: "In progress", color: "var(--blue)" },
  { id: "waiting", label: "Waiting on someone", color: "var(--mild)" },
  { id: "done", label: "Done", color: "var(--warm)" },
];
export const PRIORITY: { id: TaskPriority; label: string; color: string }[] = [
  { id: "urgent", label: "Urgent", color: "var(--cold)" }, { id: "high", label: "High", color: "var(--mild)" },
  { id: "normal", label: "Normal", color: "var(--muted)" }, { id: "low", label: "Low", color: "var(--muted)" },
];
export const REPEATS: { id: TaskRepeat; label: string }[] = [
  { id: "none", label: "Does not repeat" }, { id: "daily", label: "Every day" }, { id: "weekly", label: "Every week" },
  { id: "biweekly", label: "Every 2 weeks" }, { id: "monthly", label: "Every month" }, { id: "quarterly", label: "Every 3 months" },
];
const repeatLabel = (r: TaskRepeat) => REPEATS.find((x) => x.id === r)?.label || "";
const statusOf = (s: TaskStatus) => STATUS.find((x) => x.id === s) || STATUS[0];
const prioOf = (p: TaskPriority) => PRIORITY.find((x) => x.id === p) || PRIORITY[2];

export function StatusChip({ s }: { s: TaskStatus }) {
  const x = statusOf(s);
  return <span className="tchip" style={{ color: x.color, borderColor: `color-mix(in srgb, ${x.color} 45%, transparent)` }}><i style={{ background: x.color }} />{x.label}</span>;
}
export function PriorityChip({ p }: { p: TaskPriority }) {
  if (p === "normal" || p === "low") return null;
  const x = prioOf(p);
  return <span className="tchip" style={{ color: x.color, borderColor: `color-mix(in srgb, ${x.color} 45%, transparent)` }}>{x.label}</span>;
}

/** Pick people: type to filter, click to add or remove. */
export function PeoplePicker({ value, onChange, exclude = [], label }: { value: string[]; onChange: (ids: string[]) => void; exclude?: string[]; label: string }) {
  const { m } = useData();
  const [q, setQ] = useState("");
  const people = m.users.filter((u) => u.status === "active" && !exclude.includes(u.id));
  const picked = value.map((id) => m.userMap.get(id)).filter(Boolean);
  const list = people.filter((u) => !value.includes(u.id) && (!q || `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 8);
  return <div className="picker">
    <span className="picker-lbl">{label}</span>
    <div className="chips" style={{ marginTop: 0 }}>
      {picked.map((u) => <button type="button" key={u!.id} className="chip" aria-pressed="true" onClick={() => onChange(value.filter((x) => x !== u!.id))} title="Remove">
        <Avatar name={u!.name || u!.email} image={u!.image} size={18} /> {u!.id === m.me.id ? "You" : u!.name || u!.email} ×</button>)}
      <input type="search" placeholder={picked.length ? "Add another…" : "Type a name…"} value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 160px", minWidth: 140, width: "auto" }} aria-label={label} />
    </div>
    {q && <div className="picker-list">{list.length ? list.map((u) => <button type="button" key={u.id} onClick={() => { onChange([...value, u.id]); setQ(""); }}>
      <Avatar name={u.name || u.email} image={u.image} size={22} /><span>{u.name || u.email}<br /><span className="small muted">{u.email}</span></span></button>) : <p className="small muted" style={{ margin: 8 }}>Nobody matches.</p>}</div>}
  </div>;
}

export function TaskDialog({ task, contactId, companyId, dealId, onClose }: { task?: TaskDTO; contactId?: string; companyId?: string | null; dealId?: string; onClose: () => void }) {
  const { m, run } = useData(); const router = useRouter();
  const [f, setF] = useState({ title: task?.title || "", notes: task?.notes || "", dueDate: task?.dueDate || "", assigneeId: task?.assigneeId ?? m.me.id,
    status: task?.status || ("todo" as TaskStatus), priority: task?.priority || ("normal" as TaskPriority), repeat: task?.repeat || ("none" as TaskRepeat) });
  const [watchers, setWatchers] = useState<string[]>(task?.watcherIds || []);
  // several leads and companies: opening from a lead or company page starts with that one
  const [leadIds, setLeadIds] = useState<string[]>(() => task ? taskLeadIds(task) : contactId ? [contactId] : []);
  const [coIds, setCoIds] = useState<string[]>(() => task ? taskCompanyIds(task) : companyId ? [companyId] : contactId && m.contactMap.get(contactId)?.companyId ? [m.contactMap.get(contactId)!.companyId!] : []);
  const addLead = (id: string) => { if (!id) return; setLeadIds((x) => (x.includes(id) ? x : [...x, id])); const co = m.contactMap.get(id)?.companyId; if (co) setCoIds((x) => (x.includes(co) ? x : [...x, co])); };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!f.title.trim()) return;
    const json = { ...f, title: f.title.trim(), dueDate: f.dueDate || null, assigneeId: f.assigneeId || null, watcherIds: watchers.filter((w) => w !== f.assigneeId) };
    if (task) { if (await run(() => api(`/api/tasks/${task.id}`, { method: "PATCH", json: { ...json, contactIds: leadIds, companyIds: coIds } }), "Task saved")) onClose(); return; }
    const r = await run(() => api<{ id: string }>("/api/tasks", { json: { ...json, contactIds: leadIds, companyIds: coIds, dealId: dealId || null } }),
      watchers.length ? `Task added. ${watchers.length} ${watchers.length === 1 ? "person" : "people"} notified.` : "Task added");
    if (r) { onClose(); router.push(`/tasks?id=${r.id}`); }
  };
  const lead = contactId ? m.contactMap.get(contactId) : task?.contactId ? m.contactMap.get(task.contactId) : undefined;
  return <Modal open onClose={onClose} label={task ? "Edit task" : "New task"}><form className="dlg form" onSubmit={submit}>
    <header><h2>{task ? "Edit task" : "New task"}</h2><button type="button" className="btn ghost" onClick={onClose}>Close</button></header>
    <label>What needs doing<input type="text" value={f.title} onChange={set("title")} required autoFocus placeholder="Send proposal to Acme" /></label>
    <label>Notes<AiText kind="task" rows={3} value={f.notes} onChange={set("notes")} placeholder="Context, links, what done looks like" /></label>
    <div className="two">
      <label>Assigned to<select value={f.assigneeId} onChange={set("assigneeId")}><option value="">Nobody yet</option>{m.users.filter((u) => u.status === "active").map((u) => <option key={u.id} value={u.id}>{u.id === m.me.id ? "You" : u.name || u.email}</option>)}</select></label>
      <label>Due<input type="date" value={f.dueDate} onChange={set("dueDate")} /></label>
      <label>Priority<select value={f.priority} onChange={set("priority")}>{PRIORITY.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
      <label>Status<select value={f.status} onChange={set("status")}>{STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
      <label>Repeat<select value={f.repeat} onChange={set("repeat")}>{REPEATS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
    </div>
    {f.repeat !== "none" && <p className="small muted" style={{ margin: 0 }}>When it's marked done, the next one is created automatically{f.dueDate ? "" : " (due one interval from today)"}. Reminders go out the day before it's due and if it becomes overdue.</p>}
    <PeoplePicker label="Tag people (they get notified and can reply)" value={watchers} onChange={setWatchers} exclude={f.assigneeId ? [f.assigneeId] : []} />
    <div className="tk-links"><span className="small muted">Leads {leadIds.length > 0 && `(${leadIds.length})`}</span>
      {leadIds.length > 0 && <div className="chips">{leadIds.map((id) => <span key={id} className="chip" aria-pressed="true">{m.contactMap.get(id)?.name || "Lead"}<button type="button" className="linkbtn" aria-label={`Remove ${m.contactMap.get(id)?.name || "lead"}`} onClick={() => setLeadIds((x) => x.filter((y) => y !== id))}>×</button></span>)}</div>}
      <SelectAdd kind="contact" value="" onChange={addLead} label="Add a lead"><option value="">{leadIds.length ? "+ Add another lead" : "+ Add a lead (optional)"}</option>{[...m.contacts].filter((c) => !leadIds.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}{c.companyId ? `, ${m.companyMap.get(c.companyId)?.name || ""}` : ""}</option>)}</SelectAdd></div>
    <div className="tk-links"><span className="small muted">Companies {coIds.length > 0 && `(${coIds.length})`}</span>
      {coIds.length > 0 && <div className="chips">{coIds.map((id) => <span key={id} className="chip" aria-pressed="true">{m.companyMap.get(id)?.name || "Company"}<button type="button" className="linkbtn" aria-label={`Remove ${m.companyMap.get(id)?.name || "company"}`} onClick={() => setCoIds((x) => x.filter((y) => y !== id))}>×</button></span>)}</div>}
      <SelectAdd kind="company" value="" onChange={(id) => id && setCoIds((x) => (x.includes(id) ? x : [...x, id]))} label="Add a company"><option value="">{coIds.length ? "+ Add another company" : "+ Add a company (optional)"}</option>{[...m.companies].filter((c) => !coIds.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectAdd></div>
    <div className="btns"><button className="btn primary">{task ? "Save task" : "Create task"}</button>
      {task && <button type="button" className="btn danger" onClick={async () => { if (confirm("Delete this task and all its replies and attachments?") && await run(() => api(`/api/tasks/${task.id}`, { method: "DELETE" }), "Task deleted")) { onClose(); router.push("/tasks"); } }}>Delete</button>}</div>
  </form></Modal>;
}

/** Compact list used on Home, lead and company pages. Click a task to open it. */
export function TaskList({ tasks, showLink = true, selected, onToggle }: { tasks: TaskDTO[]; showLink?: boolean; selected?: Set<string>; onToggle?: (id: string) => void }) {
  const { m, run } = useData();
  if (!tasks.length) return <p className="empty">No tasks.</p>;
  return <ul className="rows">{tasks.map((t) => { const L = taskLeadIds(t), C = taskCompanyIds(t); const c = L[0] ? m.contactMap.get(L[0]) : undefined; const co = C[0] ? m.companyMap.get(C[0]) : undefined;
    const more = c ? L.length - 1 + C.filter((x) => x !== c.companyId).length : C.length - 1;
    const mine = t.assigneeId === m.me.id || t.createdById === m.me.id || t.watcherIds.includes(m.me.id) || m.me.role === "admin" || m.me.role === "manager";
    return <li key={t.id} className="prodrow" style={{ gridTemplateColumns: "auto minmax(0,1fr) auto" }}>
      {selected && onToggle ? <input type="checkbox" className="sel-box" checked={selected.has(t.id)} aria-label={`Select ${t.title}`} onChange={() => onToggle(t.id)} /> : <input type="checkbox" checked={t.done} disabled={!mine} aria-label={`Mark ${t.title} done`} onChange={() => run(() => api(`/api/tasks/${t.id}`, { method: "PATCH", json: { status: t.done ? "todo" : "done" } }), t.done ? "Task reopened" : "Task done")} />}
      <Link className="colink" href={`/tasks?id=${t.id}`} style={{ textAlign: "left", color: "var(--ink)", textDecoration: t.done ? "line-through" : "none", minWidth: 0 }}>
        <span className="nm" style={{ display: "block" }}>{t.title} <PriorityChip p={t.priority} />{t.repeat !== "none" && <span className="small muted" title={repeatLabel(t.repeat)}> ↻</span>}</span>
        <span className="small muted">{[userName(m, t.assigneeId), showLink && c ? c.name + (more > 0 ? ` +${more}` : "") : null, showLink && !c && co ? co.name + (more > 0 ? ` +${more}` : "") : null, t.commentCount ? `${t.commentCount} ${t.commentCount === 1 ? "reply" : "replies"}` : null].filter(Boolean).join(" · ")}</span></Link>
      <span className="small" style={{ color: taskOverdue(t) ? "var(--cold)" : t.dueDate === todayStr() ? "var(--mild)" : "var(--muted)", textAlign: "right" }}>
        {t.status !== "todo" && t.status !== "done" ? <><StatusChip s={t.status} /><br /></> : null}
        {t.dueDate ? (taskOverdue(t) ? `Overdue · ${niceDate(t.dueDate)}` : t.dueDate === todayStr() ? "Due today" : `Due ${niceDate(t.dueDate)}`) : "No date"}</span>
    </li>; })}</ul>;
}

type Detail = { rights: { edit: boolean; status: boolean; comment: boolean; remove: boolean }; comments: TaskCommentDTO[] };
export function TaskDetail({ task }: { task: TaskDTO }) {
  const { m, run, reload } = useData(); const router = useRouter();
  const { data, mutate } = useSWR<Detail>(`/api/tasks/${task.id}`, (u: string) => api<Detail>(u), { refreshInterval: 15000 });
  const [edit, setEdit] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const names = useMemo(() => new Map(m.users.map((u) => [u.id, u.name || u.email])), [m.users]);
  const refresh = useCallback(async () => { await mutate(); await reload(); setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50); }, [mutate, reload]);
  useEffect(() => { reload(); }, [task.id, reload]); // clears the bell for this task
  const rights = data?.rights;
  const lead = task.contactId ? m.contactMap.get(task.contactId) : undefined; const co = task.companyId ? m.companyMap.get(task.companyId) : lead?.companyId ? m.companyMap.get(lead.companyId) : undefined;
  const deal = task.dealId ? m.deals.find((d) => d.id === task.dealId) : undefined;
  const setStatus = (s: TaskStatus) => run(() => api(`/api/tasks/${task.id}`, { method: "PATCH", json: { status: s } }), s === "done" ? "Task done" : `Status: ${statusOf(s).label}`).then(() => mutate());
  return <div className="grid">
    <div className="s12 inline" style={{ justifyContent: "space-between" }}>
      <button className="btn ghost" onClick={() => router.push("/tasks")}>All tasks</button>
      <div className="inline">{rights?.edit && <button className="btn" onClick={() => setEdit(true)}>Edit task</button>}
        {rights?.status && task.status !== "done" && <button className="btn primary" onClick={() => setStatus("done")}>✓ Mark done</button>}
        {rights?.status && task.status === "done" && <button className="btn" onClick={() => setStatus("todo")}>Reopen</button>}</div>
    </div>
    <section className="panel s8">
      <div className="inline" style={{ gap: 8, flexWrap: "wrap" }}><StatusChip s={task.status} /><PriorityChip p={task.priority} />{task.repeat !== "none" && <span className="tchip" style={{ color: "var(--cyan)", borderColor: "color-mix(in srgb, var(--cyan) 45%, transparent)" }}>↻ {repeatLabel(task.repeat)}</span>}
        {task.dueDate && <span className="small" style={{ color: taskOverdue(task) ? "var(--cold)" : "var(--muted)" }}>{taskOverdue(task) ? "Overdue · " : "Due "}{niceDate(task.dueDate)}</span>}</div>
      <h2 style={{ fontSize: "1.35rem", margin: "10px 0 6px", textDecoration: task.done ? "line-through" : "none" }}>{task.title}</h2>
      {task.notes ? <p style={{ whiteSpace: "pre-wrap", margin: "0 0 6px", color: "var(--ink2)" }}><Linkify text={task.notes} /></p> : <p className="small muted" style={{ margin: 0 }}>No details.</p>}
      <div className="thread">
        {!data && <p className="small muted">Loading the conversation…</p>}
        {data && <ThreadView items={data.comments} editUrl={(cid) => `/api/tasks/${task.id}/comments/${cid}`} onEdited={() => mutate()} onDelete={async (cid) => { if (confirm("Delete this reply and its attachments?") && await run(() => api(`/api/tasks/${task.id}/comments/${cid}`, { method: "DELETE" }), "Reply deleted")) mutate(); }} />}
        <div ref={end} />
      </div>
      {data && <Composer postUrl={`/api/tasks/${task.id}/comments`} onSent={refresh} canReply={!!rights?.comment} readOnlyNote="You can read this task. Ask the assignee to tag you if you need to reply." />}
    </section>
    <aside className="s4 grid" style={{ alignContent: "start" }}>
      <section className="panel s12">
        <h2 style={{ marginBottom: 10 }}>Details</h2>
        <dl className="kv">
          <dt>Status</dt><dd>{rights?.status ? <select aria-label="Status" value={task.status} onChange={(e) => setStatus(e.target.value as TaskStatus)} style={{ width: "auto" }}>{STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select> : statusOf(task.status).label}</dd>
          <dt>Assigned to</dt><dd>{task.assigneeId ? <span className="who-cell"><Avatar name={userName(m, task.assigneeId)} image={m.userMap.get(task.assigneeId)?.image} size={20} />{userName(m, task.assigneeId)}</span> : "Nobody yet"}</dd>
          <dt>Priority</dt><dd>{prioOf(task.priority).label}</dd>
          <dt>Repeats</dt><dd>{repeatLabel(task.repeat)}{task.repeatSpawnedId && <> · <Link className="colink" href={`/tasks?id=${task.repeatSpawnedId}`}>next one</Link></>}</dd>
          <dt>Due</dt><dd>{task.dueDate || "No date"}</dd>
          <dt>Created by</dt><dd>{userName(m, task.createdById)}, {ago(task.createdAt)}</dd>
          {taskLeadIds(task).length > 0 && <><dt>{taskLeadIds(task).length > 1 ? "Leads" : "Lead"}</dt><dd>{taskLeadIds(task).map((id, i) => <span key={id}>{i ? ", " : ""}<Link className="colink" href={`/contacts?id=${id}`}>{m.contactMap.get(id)?.name || "Lead"}</Link></span>)}</dd></>}
          {(taskCompanyIds(task).length > 0 || co) && <><dt>{taskCompanyIds(task).length > 1 ? "Companies" : "Company"}</dt><dd>{(taskCompanyIds(task).length ? taskCompanyIds(task) : co ? [co.id] : []).map((id, i) => <span key={id}>{i ? ", " : ""}<Link className="colink" href={`/companies?id=${id}`}>{m.companyMap.get(id)?.name || "Company"}</Link></span>)}</dd></>}
          {deal && <><dt>Deal</dt><dd><Link className="colink" href="/deals">{deal.name}</Link></dd></>}
        </dl>
      </section>
      <section className="panel s12">
        <div className="inline" style={{ justifyContent: "space-between" }}><h2>Tagged ({task.watcherIds.length})</h2>{rights?.edit && <button className="linkbtn" onClick={() => setEdit(true)}>Change</button>}</div>
        {task.watcherIds.length ? <ul className="rows" style={{ marginTop: 8 }}>{task.watcherIds.map((id) => <li key={id} className="who-cell" style={{ padding: "6px 0" }}><Avatar name={userName(m, id)} image={m.userMap.get(id)?.image} size={22} />{id === m.me.id ? "You" : userName(m, id)}</li>)}</ul>
          : <p className="small muted" style={{ margin: "6px 0 0" }}>Nobody tagged. Tag people to keep them in the loop; they can reply and add files.</p>}
      </section>
    </aside>
    {edit && <TaskDialog task={task} onClose={() => { setEdit(false); mutate(); }} />}
  </div>;
}
