"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ContactDTO } from "@/lib/types";
import { useData } from "./data";
import { Icon } from "./ui";
import { coName, dueReason, firstName, isDue, lastTouch, todayStr, type Model, uniqueMeetings } from "./model";
import { activeActions, ruleActions } from "./nextAction";
import { ScopeToggle } from "./ScopeToggle";

const DAY = 86400_000;
const greet = (h: number) => (h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
/** Who to contact first: overdue before due, hotter before cooler, longest silence first. */
const score = (m: Model, c: ContactDTO) => {
  const r = dueReason(m, c); const overdue = /overdue|not contacted/i.test(r) ? 2 : 1;
  return overdue * 100 + (c.rating || 0) * 12 + Math.min(30, Math.floor((Date.now() - lastTouch(m, c)) / DAY));
};

/**
 * Home's top: a personal "today" cockpit. Greeting and a one-line read of the day, a ring showing how much of
 * today's follow-up work is done, the leads most worth contacting next, and today's meetings and tasks.
 */
export function TodayCockpit({ m }: { m: Model }) {
  const { m: full } = useData();
  const me = full.me; const today = todayStr(); const start = new Date(`${today}T00:00:00`).getTime();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  const mine = m.contacts.filter((c) => c.ownerId === me.id || (!c.ownerId && me.role !== "rep" && me.role !== "viewer"));
  const due = mine.filter((c) => isDue(m, c));
  const touched = mine.filter((c) => lastTouch(m, c) >= start && m.activities.some((a) => a.contactId === c.id && a.byId === me.id && a.at >= start));
  const total = due.length + touched.length; const pct = total ? Math.round((touched.length / total) * 100) : 100;
  // next best actions across my open leads: the most urgent step for each, most urgent first
  const next = mine.map((c) => ({ c, a: activeActions(m, c, ruleActions(m, c))[0] })).filter((x) => x.a)
    .sort((x, y) => y.a.urgency - x.a.urgency || score(m, y.c) - score(m, x.c)).slice(0, 4);
  const meetings = uniqueMeetings(m.activities.filter((a) => a.type === "meeting" && !a.cancelled && a.meetingAt && a.meetingAt >= start && a.meetingAt < start + DAY && a.byId === me.id)).sort((a, b) => a.meetingAt! - b.meetingAt!);
  const tasks = m.tasks.filter((t) => !t.done && t.assigneeId === me.id && t.dueDate && t.dueDate <= today).sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
  const overdueTasks = tasks.filter((t) => t.dueDate! < today).length;
  const line = [due.length ? `${due.length} lead${due.length === 1 ? "" : "s"} to follow up` : "no follow-ups waiting",
    meetings.length ? `${meetings.length} meeting${meetings.length === 1 ? "" : "s"}` : "", tasks.length ? `${tasks.length} task${tasks.length === 1 ? "" : "s"} due${overdueTasks ? ` (${overdueTasks} overdue)` : ""}` : ""].filter(Boolean);
  const R = 52, C = 2 * Math.PI * R;

  return <section className="cockpit" aria-label="Today">
    <div className="ck-hello">
      <div className="ck-date">{now ? now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }) : "\u00a0"}</div>
      <h2 className="ck-greet">{now ? greet(now.getHours()) : "Hello"}, {firstName(me.name || me.email)}</h2>
      <ScopeToggle />
      <p className="ck-line">Today: {line.length > 1 ? `${line.slice(0, -1).join(", ")} and ${line[line.length - 1]}` : line[0]}.</p>
      <div className="ck-actions">
        <button className="btn primary" onClick={() => window.dispatchEvent(new CustomEvent("lt:jump"))}><Icon name="search" size={15} /> Jump to anything <kbd>⌘K</kbd></button>
        <Link className="btn" href="/followups">All follow-ups</Link>
      </div>
    </div>
    <div className="ck-ring" role="img" aria-label={`${pct}% of today's follow-up work done`}>
      <svg viewBox="0 0 128 128" width="150" height="150">
        <defs><linearGradient id="ckg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--cyan)" /><stop offset="1" stopColor="var(--violet)" /></linearGradient></defs>
        <circle cx="64" cy="64" r={R} fill="none" stroke="var(--chip)" strokeWidth="9" />
        {pct > 0 && <circle className="ck-arc" cx="64" cy="64" r={R} fill="none" stroke="url(#ckg)" strokeWidth="9" strokeLinecap="round" transform="rotate(-90 64 64)"
          strokeDasharray={`${(C * pct) / 100} ${C}`} />}
      </svg>
      <div className="ck-ring-txt"><b className="num">{pct}%</b><span>{touched.length} of {total || 0} done</span></div>
    </div>
    <div className="ck-next">
      <h3>Next best actions</h3>
      {next.length ? <ul>{next.map(({ c, a }) => <li key={c.id} className={"u" + a.urgency}>
        <Link href={`/contacts?id=${c.id}`} className="ck-lead" title={a.why}><b>{a.text}</b><span>{[c.name, coName(m, c)].filter(Boolean).join(" · ")} · {a.why}</span></Link>
        <span className="ck-quick">
          {c.email && <Link href={`/contacts?id=${c.id}&do=email`} aria-label={`Email ${c.name}`} title="Email"><Icon name="mail" size={15} /></Link>}
          {c.phone && <Link href={`/contacts?id=${c.id}&do=call`} aria-label={`Call ${c.name}`} title="Call"><Icon name="phone" size={15} /></Link>}
        </span></li>)}</ul>
        : <p className="ck-clear">All caught up. Nobody is waiting on you right now.</p>}
    </div>
    <div className="ck-agenda">
      <h3>Agenda</h3>
      {meetings.length || tasks.length ? <ul>
        {meetings.map((a) => <li key={a.id}><time>{new Date(a.meetingAt!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time><Link href={`/contacts?id=${a.contactId}`}>{a.subject || "Meeting"}</Link>{a.withIds.length > 1 && <span className="small muted ck-n"> · {a.withIds.length} people</span>}</li>)}
        {tasks.slice(0, 5 - Math.min(meetings.length, 4)).map((t) => <li key={t.id} className={t.dueDate! < today ? "late" : ""}><time>{t.dueDate! < today ? "Overdue" : "Today"}</time><Link href={`/tasks?id=${t.id}`}>{t.title}</Link></li>)}
      </ul> : <p className="ck-clear">No meetings or tasks due today.</p>}
    </div>
  </section>;
}
