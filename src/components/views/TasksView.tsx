"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { TaskDTO, TaskStatus } from "@/lib/types";
import { api, useData } from "../data";
import { Avatar, Icon, Panel } from "../ui";
import { PRIORITY, PriorityChip, STATUS, StatusChip, TaskDetail, TaskDialog, TaskList } from "../tasks";
import { taskDueToday, taskOverdue, todayStr, userName, taskLeadIds, taskCompanyIds, niceDate } from "../model";
import { CalendarSuggestions } from "../CalendarSuggestions";

type Tab = "assigned" | "tagged" | "created" | "all";
const PRANK = { urgent: 0, high: 1, normal: 2, low: 3 } as const;

function Card({ t, onDragStart }: { t: TaskDTO; onDragStart?: (e: React.DragEvent) => void }) {
  const { m } = useData();
  const lead = t.contactId ? m.contactMap.get(t.contactId) : undefined;
  return <Link href={`/tasks?id=${t.id}`} className="tcard" draggable={!!onDragStart} onDragStart={onDragStart}>
    <div className="inline" style={{ justifyContent: "space-between", gap: 6 }}><b style={{ fontWeight: 600 }}>{t.title}</b><PriorityChip p={t.priority} /></div>
    {lead && <div className="small muted">{lead.name}</div>}
    <div className="inline small muted" style={{ justifyContent: "space-between", marginTop: 8 }}>
      <span className="who-cell">{t.assigneeId ? <><Avatar name={userName(m, t.assigneeId)} image={m.userMap.get(t.assigneeId)?.image} size={18} />{t.assigneeId === m.me.id ? "You" : userName(m, t.assigneeId)}</> : "Unassigned"}</span>
      <span>{t.commentCount > 0 && `💬 ${t.commentCount} `}{t.fileCount > 0 && `📎 ${t.fileCount} `}
        {t.dueDate && <span style={{ color: taskOverdue(t) ? "var(--cold)" : t.dueDate === todayStr() ? "var(--mild)" : undefined }}>{t.dueDate === todayStr() ? "Today" : niceDate(t.dueDate)}</span>}</span>
    </div>
  </Link>;
}

export function TasksView() {
  const [sel, setSel] = useState<Set<string> | null>(null);
  const { run: runB } = useData();
  const bulk = async (action: "done" | "delete") => { if (!sel?.size) return; const n = sel.size;
    const r = await runB(() => api<{ done: number; failed: string[] }>("/api/tasks/bulk", { json: { ids: [...sel], action } }), action === "done" ? `${n} task${n === 1 ? "" : "s"} marked done` : `${n} task${n === 1 ? "" : "s"} deleted`) as { failed: string[] } | null;
    if (r && r.failed.length) alert(`${r.failed.length} couldn't be changed (you can only change your own or ones you manage).`); setSel(null); };
  const toggle = (id: string) => setSel((s) => { const n = new Set(s || []); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const { m, perms, run } = useData(); const sp = useSearchParams(); const router = useRouter();
  const open = sp.get("id") ? m.tasks.find((t) => t.id === sp.get("id")) : undefined;
  const [tab, setTab] = useState<Tab>("assigned"); const [view, setView] = useState<"list" | "board">("list");
  const [q, setQ] = useState(""); const [prio, setPrio] = useState(""); const [person, setPerson] = useState(""); const [add, setAdd] = useState(false); const [showDone, setShowDone] = useState(false);
  const me = m.me.id;
  const counts = useMemo(() => ({
    assigned: m.tasks.filter((t) => !t.done && t.assigneeId === me).length,
    tagged: m.tasks.filter((t) => !t.done && t.watcherIds.includes(me)).length,
    created: m.tasks.filter((t) => !t.done && t.createdById === me).length,
    all: m.tasks.filter((t) => !t.done).length,
  }), [m.tasks, me]);
  const ts = useMemo(() => m.tasks.filter((t) =>
    (tab === "all" ? (!person || (person === "none" ? !t.assigneeId : t.assigneeId === person)) : tab === "assigned" ? t.assigneeId === me : tab === "tagged" ? t.watcherIds.includes(me) : t.createdById === me)
    && (!prio || t.priority === prio)
    && (!q || `${t.title} ${t.notes} ${taskLeadIds(t).map((x) => m.contactMap.get(x)?.name || "").join(" ")} ${taskCompanyIds(t).map((x) => m.companyMap.get(x)?.name || "").join(" ")}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => PRANK[a.priority] - PRANK[b.priority] || (a.dueDate || "9999").localeCompare(b.dueDate || "9999")), [m, tab, me, person, prio, q]);

  if (sp.get("id") && !open) return <div className="grid"><Panel className="s12" title="Task not found"><p className="empty">It may have been deleted. <Link className="linkbtn" href="/tasks">Back to tasks</Link></p></Panel></div>;
  if (open) return <TaskDetail task={open} />;

  const active = ts.filter((t) => !t.done);
  const overdue = active.filter(taskOverdue), today = active.filter(taskDueToday), later = active.filter((t) => t.dueDate && !taskOverdue(t) && !taskDueToday(t)), nodate = active.filter((t) => !t.dueDate);
  const done = ts.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 40);
  const move = (id: string, s: TaskStatus) => run(() => api(`/api/tasks/${id}`, { method: "PATCH", json: { status: s } }), `Moved to ${STATUS.find((x) => x.id === s)?.label}`);
  const TABS: [Tab, string][] = [["assigned", "Assigned to me"], ["tagged", "Tagged"], ["created", "Created by me"], ["all", "Everyone"]];

  return <div className="grid">
    <div className="s12 inline" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
      <div className="seg" role="tablist" aria-label="Which tasks">{TABS.map(([id, l]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{l}{counts[id] ? <span className="seg-n">{counts[id]}</span> : null}</button>)}</div>
      <div className="inline" style={{ flexWrap: "wrap" }}>
        <input type="search" placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 180, flex: "0 0 auto" }} aria-label="Search tasks" />
        <select aria-label="Priority" value={prio} onChange={(e) => setPrio(e.target.value)} style={{ width: "auto", flex: "0 0 auto" }}><option value="">Any priority</option>{PRIORITY.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        {tab === "all" && <select aria-label="Person" value={person} onChange={(e) => setPerson(e.target.value)} style={{ width: "auto", flex: "0 0 auto" }}><option value="">Anyone</option><option value="none">Unassigned</option>{m.users.filter((u) => u.status === "active").map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}</select>}
        <div className="seg" aria-label="View"><button aria-pressed={view === "list"} onClick={() => setView("list")} title="List"><Icon name="list" size={16} /></button><button aria-pressed={view === "board"} onClick={() => setView("board")} title="Board"><Icon name="board" size={16} /></button></div>
        {perms.write && <button className="btn primary" onClick={() => setAdd(true)}>+ New task</button>}
      </div>
    </div>
    <CalendarSuggestions />
    {view === "list" && <div className="s12 bulkbar">{sel ? <><b className="small">{sel.size} selected</b>
        <button type="button" className="btn sm" disabled={!sel.size} onClick={() => bulk("done")}>✓ Mark done</button>
        <button type="button" className="btn sm" disabled={!sel.size} onClick={() => { if (confirm(`Delete ${sel.size} task${sel.size === 1 ? "" : "s"}?`)) bulk("delete"); }}>Delete</button>
        <button type="button" className="linkbtn small" onClick={() => setSel(new Set([...overdue, ...today, ...later, ...nodate].map((x) => x.id)))}>Select all open</button>
        <button type="button" className="linkbtn small" onClick={() => setSel(null)}>Cancel</button></>
      : <button type="button" className="btn sm ghost" onClick={() => setSel(new Set())}>☐ Select</button>}</div>}
    {view === "list" ? <>
      <Panel className="s6" title={`Overdue and today (${overdue.length + today.length})`} sub={`Today is ${niceDate(todayStr())}`}><TaskList tasks={[...overdue, ...today]} selected={sel || undefined} onToggle={toggle} /></Panel>
      <Panel className="s6" title={`Coming up (${later.length})`}><TaskList tasks={later} selected={sel || undefined} onToggle={toggle} /></Panel>
      {nodate.length > 0 && <Panel className="s12" title={`No due date (${nodate.length})`}><TaskList tasks={nodate} selected={sel || undefined} onToggle={toggle} /></Panel>}
      <Panel className="s12" title="Done" action={<button className="linkbtn" onClick={() => setShowDone(!showDone)}>{showDone ? "Hide" : `Show ${done.length}`}</button>}>{showDone ? <TaskList tasks={done} selected={sel || undefined} onToggle={toggle} /> : <p className="empty">Hidden.</p>}</Panel>
    </> : <div className="s12 board">{STATUS.map((s) => { const col = s.id === "done" ? done : ts.filter((t) => t.status === s.id);
      return <div key={s.id} className="bcol" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const id = e.dataTransfer.getData("text/task"); const t = m.tasks.find((x) => x.id === id); if (t && t.status !== s.id) move(id, s.id); }}>
        <div className="bcol-h"><StatusChip s={s.id} /><span className="small muted">{col.length}</span></div>
        {col.map((t) => <Card key={t.id} t={t} onDragStart={(e) => e.dataTransfer.setData("text/task", t.id)} />)}
        {!col.length && <p className="small muted" style={{ textAlign: "center", padding: 16 }}>Drop tasks here</p>}
      </div>; })}</div>}
    {add && <TaskDialog onClose={() => setAdd(false)} />}
  </div>;
}
