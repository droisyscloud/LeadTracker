"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { api, useData } from "../data";
import { isOpenDeal, money, todayStr, userName, uniqueMeetings, taskLeadIds } from "../model";
import { BookMeetingDialog } from "./BookMeetingDialog";

type Kind = "task" | "followup" | "meeting" | "event" | "deal" | "billing" | "collect" | "outside";
type Item = { id: string; kind: Kind; date: string; time?: number; title: string; sub: string; href: string; done?: boolean; overdue?: boolean; movable: boolean; ownerId: string | null; color?: string };
const KIND: Record<Kind, { label: string; color: string; icon: string }> = {
  task: { label: "Tasks", color: "var(--k-task)", icon: "☑" }, followup: { label: "Follow-ups", color: "var(--mild)", icon: "↻" },
  meeting: { label: "Meetings", color: "var(--k-meeting)", icon: "◷" }, event: { label: "Events", color: "var(--cyan)", icon: "★" }, deal: { label: "Deal close dates", color: "var(--warm)", icon: "$" }, collect: { label: "Collections", color: "var(--cold)", icon: "₵" }, billing: { label: "Invoices", color: "#F2C14E", icon: "₿" }, outside: { label: "Other calendars", color: "#7c5cff", icon: "🗓" }
};
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s: string, n: number) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return ymd(d); };
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Everything with a date in one place: tasks, lead follow-ups, meetings, events and deal close dates. Drag tasks and follow-ups to another day to move them. */
export function CalendarView() {
  const pick = (d: string) => { setSel(d); setTimeout(() => { const h = document.getElementById("cal-day-h"); if (!h) return; const r = h.getBoundingClientRect();
    if (r.top < 60 || r.top > window.innerHeight - 120) h.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60); };
  const { m, run, perms } = useData();
  const [mode, setMode] = useState<"month" | "week">("month");
  const [anchor, setAnchor] = useState(todayStr());
  const [who, setWho] = useState<"mine" | "all">("mine");
  const [kinds, setKinds] = useState<Kind[]>(["task", "followup", "meeting", "event", "deal", "billing", "collect", "outside"]);
  // your outside calendars (only yours), read for a window around the month or week you're looking at
  const winFrom = addDays(anchor, -45), winTo = addDays(anchor, 75);
  const { data: oc, mutate: reloadOc } = useSWR<{ events: { id: string; title: string; start: string; end: string | null; allDay: boolean; location: string; calName: string; color: string }[] }>(`/api/calendars/events?from=${winFrom}&to=${winTo}`, (u: string) => api(u), { revalidateOnFocus: false });
  const [sel, setSel] = useState(todayStr());
  const [meet, setMeet] = useState(false);
  const today = todayStr(); const me = m.me.id;

  const items = useMemo(() => {
    const out: Item[] = [];
    const mine = (owner: string | null, extra: string[] = []) => who === "all" || owner === me || extra.includes(me);
    for (const t of m.tasks) if (t.dueDate && mine(t.assigneeId, [...t.watcherIds, t.createdById || ""])) {
      const L = taskLeadIds(t); const c0 = L[0] ? m.contactMap.get(L[0]) : undefined; const c = c0 && L.length > 1 ? { ...c0, name: `${c0.name} + ${L.length - 1} more` } : c0;
      out.push({ id: t.id, kind: "task", date: t.dueDate, title: t.title, sub: [userName(m, t.assigneeId), c?.name].filter(Boolean).join(" · "), href: `/tasks?id=${t.id}`, done: t.done, overdue: !t.done && t.dueDate < today,
        movable: !t.done && (perms.manage || t.assigneeId === me || t.createdById === me), ownerId: t.assigneeId });
    }
    for (const c of m.contacts) if (c.nextFollowUp && c.status !== "won" && c.status !== "lost" && mine(c.ownerId)) {
      const co = c.companyId ? m.companyMap.get(c.companyId)?.name : "";
      out.push({ id: c.id, kind: "followup", date: c.nextFollowUp, title: `Follow up: ${c.name}`, sub: [co, userName(m, c.ownerId)].filter(Boolean).join(" · "), href: `/contacts?id=${c.id}`,
        overdue: c.nextFollowUp < today, movable: perms.manage || c.ownerId === me || (!c.ownerId && perms.write), ownerId: c.ownerId });
    }
    for (const a of uniqueMeetings(m.activities.filter((x) => x.type === "meeting" && x.meetingAt && mine(x.byId)))) {
      const c0 = m.contactMap.get(a.contactId); const c = c0 ? { ...c0, name: a.withIds.length > 1 ? `${c0.name} + ${a.withIds.length - 1} more` : c0.name } : c0; const d = new Date(a.meetingAt!);
      out.push({ id: a.id, kind: "meeting", date: ymd(d), time: a.meetingAt!, title: `${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} ${a.subject || "Meeting"}`, sub: c ? c.name : "", href: `/contacts?id=${a.contactId}`, movable: false, ownerId: a.byId });
    }
    for (const e of m.events) if (e.startDate) for (let d = e.startDate; d <= (e.endDate || e.startDate) && d <= addDays(e.startDate, 30); d = addDays(d, 1))
      out.push({ id: `${e.id}:${d}`, kind: "event", date: d, title: e.name, sub: e.location, href: "/events", movable: false, ownerId: null });
    for (const b of m.billing) if (b.dueDate && b.status !== "paid" && b.status !== "cancelled" && mine(b.assigneeId, b.watcherIds)) {
      const d = m.deals.find((x) => x.id === b.dealId); const date = b.status === "invoiced" && b.paymentDue ? b.paymentDue : b.dueDate;
      out.push({ id: b.id, kind: "billing", date, title: `${b.kind === "renewal" ? "Renewal" : b.status === "invoiced" ? "Payment due" : "Invoice"}: ${b.label}`, sub: `${d?.name || ""}${b.amount ? ` · ${d?.currency || ""} ${b.amount.toLocaleString()}` : ""}`, href: `/billing`, overdue: date < today, movable: false, ownerId: b.assigneeId });
    }
    for (const e of oc?.events || []) {
      if (e.allDay) { for (let d = e.start, k = 0; d <= (e.end || e.start) && k < 14; d = addDays(d, 1), k++) out.push({ id: `${e.id}:${d}`, kind: "outside", date: d, title: e.title, sub: [e.calName, e.location].filter(Boolean).join(" · "), href: "/calendar", movable: false, ownerId: me, color: e.color }); }
      else { const d = new Date(e.start); out.push({ id: e.id, kind: "outside", date: ymd(d), time: d.getTime(), title: `${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} ${e.title}`, sub: [e.calName, e.location].filter(Boolean).join(" · "), href: "/calendar", movable: false, ownerId: me, color: e.color }); }
    }
    // collections: open follow-ups on unpaid invoices, and promised payment dates
    for (const f of m.followups || []) { const b = m.billing.find((x) => x.id === f.billingItemId); if (!b || !mine(f.assigneeId)) continue;
      const d = m.deals.find((x) => x.id === b.dealId);
      if (f.status === "open") out.push({ id: `fu:${f.id}`, kind: "collect", date: f.dueDate, title: `Chase payment: ${b.label}`, sub: `${d?.name || ""} · ${f.type}${f.priority === "high" ? " · high priority" : ""}`, href: "/billing?tab=collections", overdue: f.dueDate < today, movable: false, ownerId: f.assigneeId });
      if (f.promiseDate && b.status !== "paid") out.push({ id: `pr:${f.id}`, kind: "collect", date: f.promiseDate, title: `Promised payment: ${b.label}`, sub: `${d?.name || ""}${f.promiseAmount ? ` · ${d?.currency || ""} ${f.promiseAmount.toLocaleString()}` : ""}`, href: "/billing?tab=collections", overdue: f.promiseDate < today, movable: false, ownerId: f.assigneeId });
    }
    for (const d of m.deals) if (d.closeDate && isOpenDeal(d) && mine(d.ownerId))
      out.push({ id: d.id, kind: "deal", date: d.closeDate, title: `${d.name} closes`, sub: `${money(d.value)} · ${userName(m, d.ownerId)}`, href: `/deals?id=${d.id}`, overdue: d.closeDate < today, movable: false, ownerId: d.ownerId });
    return out.filter((x) => kinds.includes(x.kind)).sort((a, b) => (a.time || 0) - (b.time || 0) || a.kind.localeCompare(b.kind));
  }, [m, who, kinds, me, today, perms, oc]);
  const byDay = useMemo(() => { const g = new Map<string, Item[]>(); for (const i of items) g.set(i.date, [...(g.get(i.date) || []), i]); return g; }, [items]);

  const a = new Date(`${anchor}T12:00:00`);
  const days: string[] = [];
  if (mode === "month") {
    const first = new Date(a.getFullYear(), a.getMonth(), 1); const start = addDays(ymd(first), -((first.getDay() + 6) % 7));
    for (let i = 0; i < 42; i++) days.push(addDays(start, i));
  } else { const start = addDays(anchor, -((a.getDay() + 6) % 7)); for (let i = 0; i < 7; i++) days.push(addDays(start, i)); }
  const move = (n: number) => { if (mode === "month") { const d = new Date(a.getFullYear(), a.getMonth() + n, 1); setAnchor(ymd(d)); } else setAnchor(addDays(anchor, 7 * n)); };
  const drop = (raw: string, date: string) => {
    const [kind, id] = raw.split("|"); const it = items.find((x) => x.kind === kind && x.id === id);
    if (!it || !it.movable || it.date === date) return;
    if (kind === "task") run(() => api(`/api/tasks/${id}`, { method: "PATCH", json: { dueDate: date } }), `Task moved to ${date}`);
    if (kind === "followup") run(() => api(`/api/contacts/${id}`, { method: "PATCH", json: { nextFollowUp: date } }), `Follow-up moved to ${date}`);
  };
  const title = mode === "month" ? a.toLocaleDateString([], { month: "long", year: "numeric" })
    : `${new Date(`${days[0]}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })} – ${new Date(`${days[6]}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
  const Chip = ({ it, full = false }: { it: Item; full?: boolean }) => <Link href={it.href} draggable={it.movable} onDragStart={(e) => e.dataTransfer.setData("text/cal", `${it.kind}|${it.id}`)}
    className={"cal-item" + (it.done ? " done" : "") + (it.overdue ? " late" : "")} style={{ borderLeftColor: it.color || KIND[it.kind].color }} title={`${KIND[it.kind].label}: ${it.title}${it.sub ? ` (${it.sub})` : ""}${it.movable ? ". Drag to another day to move it." : ""}`}>
    <span aria-hidden="true">{KIND[it.kind].icon}</span> {it.title}{full && it.sub && <span className="small muted"> · {it.sub}</span>}</Link>;
  const selItems = byDay.get(sel) || [];

  return <div className="grid">
    {meet && <BookMeetingDialog onClose={() => setMeet(false)} />}
    <div className="s12 inline" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
      <div className="inline" style={{ gap: 6 }}>
        <button className="btn ghost icon" aria-label="Previous" onClick={() => move(-1)}>‹</button>
        <button className="btn" onClick={() => { setAnchor(today); setSel(today); }}>Today</button>
        <button className="btn ghost icon" aria-label="Next" onClick={() => move(1)}>›</button>
        <h2 style={{ fontSize: "1.2rem", marginLeft: 6 }}>{title}</h2>
        {perms.write && m.connection && <button className="btn primary" style={{ marginLeft: 8 }} onClick={() => setMeet(true)}>+ Meeting</button>}
      </div>
      <div className="inline" style={{ flexWrap: "wrap" }}>
        <div className="seg">{(["mine", "all"] as const).map((w) => <button key={w} aria-pressed={who === w} onClick={() => setWho(w)}>{w === "mine" ? "Mine" : "Everyone"}</button>)}</div>
        <div className="seg">{(["month", "week"] as const).map((v) => <button key={v} aria-pressed={mode === v} onClick={() => setMode(v)}>{v === "month" ? "Month" : "Week"}</button>)}</div>
      </div>
    </div>
    <div className="s12 chips" style={{ marginTop: 0 }}>{(Object.keys(KIND) as Kind[]).map((k) => <button key={k} className="chip" aria-pressed={kinds.includes(k)} onClick={() => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])}>
      <i className="dot" style={{ background: KIND[k].color, marginRight: 6 }} />{KIND[k].label}</button>)}</div>
    <section className={"panel " + (mode === "month" ? "s9" : "s12")} style={{ padding: 10 }}>
      <div className={"calv " + mode}>
        {WEEK.map((w, i) => <div key={w} className="calv-w">{mode === "week" ? new Date(`${days[i]}T12:00:00`).toLocaleDateString([], { weekday: "short", day: "numeric" }) : w}</div>)}
        {days.map((d) => { const list = byDay.get(d) || []; const out = mode === "month" && new Date(`${d}T12:00:00`).getMonth() !== a.getMonth();
          return <div key={d} className={"calv-d" + (out ? " out" : "") + (d === today ? " today" : "") + (d === sel ? " sel" : "")} onClick={() => pick(d)}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); drop(e.dataTransfer.getData("text/cal"), d); }}>
            <div className="calv-n">{mode === "month" ? new Date(`${d}T12:00:00`).getDate() : ""}</div>
            {(mode === "month" ? list.slice(0, 3) : list).map((it) => <Chip key={`${it.kind}${it.id}`} it={it} full={mode === "week"} />)}
            {mode === "month" && list.length > 3 && <button className="linkbtn small" onClick={(e) => { e.stopPropagation(); pick(d); }}>+{list.length - 3} more</button>}
          </div>; })}
      </div>
    </section>
    {mode === "month" && <section className="panel s3 calv-side">
      <h2 id="cal-day-h">{sel === today ? "Today" : new Date(`${sel}T12:00:00`).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</h2>
      {selItems.length ? <div style={{ display: "grid", gap: 6, marginTop: 10 }}>{selItems.map((it) => <Chip key={`${it.kind}${it.id}`} it={it} full />)}</div>
        : <p className="empty">Nothing on this day.</p>}
      <p className="small muted" style={{ marginTop: 12 }}>Drag tasks and follow-ups onto another day to move them.</p>
    </section>}
    <OtherCalendars onChange={() => reloadOc()} />
  </div>;
}

/** Link outside calendars (personal Google, Outlook, iCloud…) by their private calendar link. Read-only; only you see them. */
function OtherCalendars({ onChange }: { onChange: () => void }) {
  const { run } = useData();
  const { data, mutate } = useSWR<{ calendars: { id: string; name: string; color: string; host: string; lastFetchAt: number | null; lastError: string | null }[] }>("/api/calendars", (u: string) => api<{ calendars: { id: string; name: string; color: string; host: string; lastFetchAt: number | null; lastError: string | null }[] }>(u));
  const [f, setF] = useState({ name: "", url: "", color: "#7c5cff" }); const [busy, setBusy] = useState(false); const [help, setHelp] = useState(false);
  const add = async () => { setBusy(true); const r = await run(() => api<{ events: number }>("/api/calendars", { json: f })) as { events: number } | null; setBusy(false);
    if (r) { setF({ name: "", url: "", color: "#7c5cff" }); mutate(); onChange(); } };
  const remove = async (id: string, name: string) => { if (!confirm(`Stop showing ${name}?`)) return; await run(() => api(`/api/calendars?id=${id}`, { method: "DELETE" }), "Calendar removed"); mutate(); onChange(); };
  const cals = data?.calendars || [];
  return <section className="panel s12"><h2>Your other calendars</h2>
    <p className="small muted" style={{ margin: "4px 0 10px" }}>See events from your personal Google, Outlook, iCloud or any other calendar alongside your work calendar here. Only you see them (read-only); they're re-read every 10 minutes. <button type="button" className="linkbtn small" onClick={() => setHelp(!help)}>{help ? "Hide how" : "Where do I find the link?"}</button></p>
    {help && <ul className="small" style={{ margin: "0 0 10px", paddingLeft: 18, lineHeight: 1.6 }}>
      <li><b>Google Calendar</b> (personal): Settings → click the calendar on the left → Integrate calendar → <i>Secret address in iCal format</i>.</li>
      <li><b>Outlook / Microsoft 365</b>: Settings → Calendar → Shared calendars → Publish a calendar → <i>ICS</i> link.</li>
      <li><b>iCloud</b>: Calendar app → share the calendar → tick <i>Public Calendar</i> → copy the link (webcal://…).</li>
      <li>Anything else that gives an <b>iCal / .ics</b> link works too.</li></ul>}
    {cals.length > 0 && <ul className="rows" style={{ marginBottom: 10 }}>{cals.map((c) => <li key={c.id} className="inline" style={{ justifyContent: "space-between", padding: "6px 0", gap: 10 }}>
      <span className="inline" style={{ gap: 8 }}><i className="dot" style={{ background: c.color }} /><b>{c.name}</b><span className="small muted">{c.host}</span>
        {c.lastError ? <span className="small" style={{ color: "var(--cold)" }}>⚠ {c.lastError}</span> : c.lastFetchAt ? <span className="small muted">read {new Date(c.lastFetchAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span> : null}</span>
      <button type="button" className="linkbtn small" onClick={() => remove(c.id, c.name)}>Remove</button></li>)}</ul>}
    <div className="inline" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
      <label style={{ flex: "0 1 200px" }}>Name<input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Personal" /></label>
      <label style={{ flex: "1 1 360px" }}>Calendar link<input type="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://… or webcal://… (.ics)" /></label>
      <label style={{ flex: "0 0 auto" }}>Colour<input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} style={{ width: 52, padding: 2 }} /></label>
      <button type="button" className="btn primary" disabled={busy || !f.name.trim() || !f.url.trim()} onClick={add}>{busy ? "Checking the link…" : "Add calendar"}</button></div>
  </section>;
}
