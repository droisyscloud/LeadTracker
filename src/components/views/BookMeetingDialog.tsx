"use client";
import { addTimelineNote } from "../timelineNote";
import { useEffect, useMemo, useState } from "react";
import type { ContactDTO } from "@/lib/types";
import { api, Modal, useData } from "../data";
import { firstName } from "../model";
import { AiText } from "../AiText";

type Busy = { start: string; end: string };
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Month grid. Past days and days more than four months out are disabled. */
function MonthPicker({ value, onPick }: { value: string; onPick: (d: string) => void }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const max = new Date(today); max.setDate(max.getDate() + 120);
  const [view, setView] = useState(() => { const d = value ? new Date(`${value}T12:00:00`) : new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const lead = (view.getDay() + 6) % 7;
  const daysIn = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => new Date(view.getFullYear(), view.getMonth(), i + 1))];
  const canPrev = view > new Date(today.getFullYear(), today.getMonth(), 1);
  const canNext = new Date(view.getFullYear(), view.getMonth() + 1, 1) <= max;
  return <div className="cal">
    <div className="cal-h">
      <button type="button" className="btn ghost icon" aria-label="Previous month" disabled={!canPrev} onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}>‹</button>
      <b>{view.toLocaleDateString([], { month: "long", year: "numeric" })}</b>
      <button type="button" className="btn ghost icon" aria-label="Next month" disabled={!canNext} onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}>›</button>
    </div>
    <div className="cal-g" role="grid" aria-label="Choose a date">
      {WEEK.map((w) => <span key={w} className="cal-w">{w}</span>)}
      {cells.map((d, i) => { if (!d) return <span key={`e${i}`} />;
        const off = d < today || d > max; const k = ymd(d); const weekend = d.getDay() === 0 || d.getDay() === 6;
        return <button key={k} type="button" role="gridcell" className={"cal-d" + (weekend ? " wk" : "") + (k === ymd(today) ? " today" : "")} aria-pressed={k === value} disabled={off}
          aria-label={d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })} onClick={() => onPick(k)}>{d.getDate()}</button>; })}
    </div>
  </div>;
}

type Person = { kind: "lead" | "user" | "email"; id: string; email: string; name: string; sub?: string };

/** Add people to a meeting: search leads and colleagues, or type any email address. */
function Attendees({ people, setPeople, companyId }: { people: Person[]; setPeople: (p: Person[]) => void; companyId?: string | null }) {
  const { m } = useData();
  const [q, setQ] = useState(""); const [open, setOpen] = useState(false);
  const has = (email: string) => people.some((p) => p.email.toLowerCase() === email.toLowerCase());
  const add = (p: Person) => { if (!has(p.email)) setPeople([...people, p]); setQ(""); };
  const leads: Person[] = m.contacts.filter((x) => x.email).map((x) => ({ kind: "lead", id: x.id, email: x.email, name: x.name, sub: [x.title, x.companyId ? m.companyMap.get(x.companyId)?.name : ""].filter(Boolean).join(", ") }));
  const users: Person[] = m.users.filter((u) => u.status === "active" && u.id !== m.me.id).map((u) => ({ kind: "user", id: u.id, email: u.email, name: u.name || u.email, sub: "Colleague" }));
  const term = q.trim().toLowerCase();
  const matches = term ? [...users, ...leads].filter((p) => !has(p.email) && (p.name.toLowerCase().includes(term) || p.email.toLowerCase().includes(term) || (p.sub || "").toLowerCase().includes(term))).slice(0, 8) : [];
  const typedEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(term) && !has(term) && ![...users, ...leads].some((p) => p.email.toLowerCase() === term) ? term : "";
  const sameCo = companyId ? leads.filter((p) => !has(p.email) && m.contactMap.get(p.id)?.companyId === companyId).slice(0, 6) : [];
  return <div className="att">
    <div className="att-list">{people.map((p) => <span key={p.email} className={"att-chip " + p.kind} title={p.email}>
      {p.kind === "user" ? "👤 " : p.kind === "email" ? "✉ " : ""}{p.name || p.email}
      <button type="button" aria-label={`Remove ${p.name || p.email}`} onClick={() => setPeople(people.filter((x) => x.email !== p.email))}>×</button></span>)}
      {!people.length && <span className="small muted">No one yet. Add the people to invite.</span>}</div>
    <div className="att-search">
      <input type="text" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (matches[0]) add(matches[0]); else if (typedEmail) add({ kind: "email", id: typedEmail, email: typedEmail, name: "" }); } }}
        placeholder="Add people: search leads or colleagues, or type an email address" aria-label="Add people" />
      {open && (matches.length > 0 || typedEmail) && <div className="att-menu" role="listbox">
        {matches.map((p) => <button key={p.email} type="button" role="option" aria-selected="false" onMouseDown={(e) => e.preventDefault()} onClick={() => add(p)}>
          <b>{p.name}</b> <span className="small muted">{p.sub ? `${p.sub} · ` : ""}{p.email}</span></button>)}
        {typedEmail && <button type="button" role="option" aria-selected="false" onMouseDown={(e) => e.preventDefault()} onClick={() => add({ kind: "email", id: typedEmail, email: typedEmail, name: "" })}>Invite <b>{typedEmail}</b></button>}
      </div>}
    </div>
    {sameCo.length > 0 && <div className="chips" style={{ marginTop: 0 }}><span className="small muted">Same company:</span>{sameCo.map((p) => <button key={p.email} type="button" className="chip" onClick={() => add(p)}>+ {p.name}</button>)}</div>}
  </div>;
}

export function BookMeetingDialog({ c, companyId, onClose }: { c?: ContactDTO; companyId?: string | null; onClose: () => void }) {
  const { m, run, toast } = useData();
  const [people, setPeople] = useState<Person[]>(c?.email ? [{ kind: "lead", id: c.id, email: c.email, name: c.name }] : []);
  const colleagueEmails = people.filter((p) => p.kind === "user").map((p) => p.email);
  const [others, setOthers] = useState<Record<string, Busy[] | null>>({});
  const [date, setDate] = useState(""); const [busy, setBusy] = useState<Busy[] | null>(null); const [loading, setLoading] = useState(false); const [err, setErr] = useState("");
  const [len, setLen] = useState(30); const [pick, setPick] = useState<number | null>(null); const [online, setOnline] = useState(true);
  const [hours, setHours] = useState<[number, number]>([8, 18]); const [custom, setCustom] = useState("");
  const [notes, setNotes] = useState("");
  const [subject, setSubject] = useState(c ? `${m.config.brand.companyName} and ${firstName(c.name)}: follow-up call` : `${m.config.brand.companyName} meeting`);
  const [body, setBody] = useState(`Hi ${c ? firstName(c.name) : "all"},\n\nLooking forward to continuing our conversation.\n\n${m.me.name || ""}`);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // free/busy for the chosen day, in this browser's time zone
  useEffect(() => {
    if (!date) return;
    const from = new Date(`${date}T00:00:00`), to = new Date(`${date}T23:59:59`);
    setLoading(true); setErr(""); setPick(null); setBusy(null);
    api<{ busy: Busy[]; others?: Record<string, Busy[] | null> }>(`/api/calendar/busy?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}${colleagueEmails.length ? `&emails=${encodeURIComponent(colleagueEmails.join(","))}` : ""}`)
      .then((r) => { setBusy(r.busy); setOthers(r.others || {}); }).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, [date, colleagueEmails.join(",")]);  // eslint-disable-line react-hooks/exhaustive-deps
  // colleagues' busy times on the chosen day, by name
  const theirs = useMemo(() => {
    if (!date) return [] as { name: string; a: number; z: number }[];
    const d0 = new Date(`${date}T00:00:00`).getTime(), d1 = d0 + 86400_000;
    return Object.entries(others).flatMap(([email, list]) => (list || []).map((b) => ({ name: people.find((p) => p.email.toLowerCase() === email)?.name || email, a: Date.parse(b.start), z: Date.parse(b.end) })))
      .filter((x) => x.a < d1 && x.z > d0);
  }, [others, date, people]);

  // only what overlaps the chosen day, in time order
  const blocks = useMemo(() => {
    if (!date) return [];
    const d0 = new Date(`${date}T00:00:00`).getTime(), d1 = d0 + 86400_000;
    return (busy || []).map((x) => [Date.parse(x.start), Date.parse(x.end)] as [number, number]).filter(([a, z]) => a < d1 && z > d0).sort((a, b) => a[0] - b[0]);
  }, [busy, date]);
  const slots = useMemo(() => {
    if (!busy || !date) return [];
    const out: { t: number; free: boolean }[] = []; const soon = Date.now() + 30 * 60_000;
    for (let q = hours[0] * 4; q + len / 15 <= hours[1] * 4; q++) {
      const s = new Date(`${date}T${pad(Math.floor(q / 4))}:${pad((q % 4) * 15)}:00`).getTime(), e = s + len * 60_000;
      if (s < soon) continue;
      out.push({ t: s, free: !blocks.some(([a, z]) => s < z && e > a) });
    }
    return out;
  }, [busy, date, len, hours, blocks]);
  const freeCount = slots.filter((s) => s.free).length;
  const customTime = custom && date ? new Date(`${date}T${custom}:00`).getTime() : null;
  const clash = customTime ? blocks.some(([a, z]) => customTime < z && customTime + len * 60_000 > a) : false;
  const chosen = pick ?? customTime;

  const book = async () => { if (!chosen) return;
    const r = await run(() => api<{ link: string | null }>("/api/calendar/book", { json: { contactIds: people.filter((p) => p.kind === "lead").map((p) => p.id), userIds: people.filter((p) => p.kind === "user").map((p) => p.id), emails: people.filter((p) => p.kind === "email").map((p) => p.email), start: new Date(chosen).toISOString(), minutes: len, subject, body, online } }), "Meeting booked and invite sent");
    if (r) { if (notes.trim()) for (const p of people.filter((x) => x.kind === "lead")) await addTimelineNote(p.id, `Meeting notes (${subject}): ${notes.trim()}`).catch(() => undefined);
      if (r.link) toast("Meeting booked. Join link added to the timeline."); onClose(); } };

  return <Modal open onClose={onClose} label="Book a meeting"><div className="dlg form dlg-wide">
    <header><h2>{c ? `Book a meeting with ${c.name}` : "Book a meeting"}</h2><button className="btn ghost" onClick={onClose}>Close</button></header>
    <div><div className="small muted" style={{ marginBottom: 6 }}>Who's invited</div><Attendees people={people} setPeople={setPeople} companyId={c?.companyId || companyId} /></div>
    <div className="book-grid">
      <div>
        <div className="small muted" style={{ marginBottom: 6 }}>1. Choose a date</div>
        <MonthPicker value={date} onPick={(d) => { setDate(d); setCustom(""); }} />
        <div className="two" style={{ marginTop: 10 }}>
          <label>Length<select value={len} onChange={(e) => { setLen(Number(e.target.value)); setPick(null); }}>{[15, 30, 45, 60, 90].map((n) => <option key={n} value={n}>{n} minutes</option>)}</select></label>
          <label>Working hours<select value={hours.join("-")} onChange={(e) => { const [a, b] = e.target.value.split("-").map(Number); setHours([a, b]); setPick(null); }}>
            {[[8, 18], [9, 17], [7, 20], [6, 22]].map(([a, b]) => <option key={a} value={`${a}-${b}`}>{a}:00 to {b}:00</option>)}</select></label>
        </div>
      </div>
      <div>
        <div className="small muted" style={{ marginBottom: 6 }}>2. Pick a time {date && <>on <b style={{ color: "var(--ink)" }}>{new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</b></>}</div>
        {!date ? <p className="empty" style={{ textAlign: "left" }}>Choose a date to see your free times.</p>
          : err ? <div className="banner" style={{ margin: 0 }}>{err}</div>
          : loading ? <p className="muted">Checking your calendar…</p>
          : <>
            {blocks.length > 0 && <p className="small muted" style={{ margin: "0 0 8px" }}>You're busy: {blocks.map(([a, z]) => `${fmtTime(a)}–${fmtTime(z)}`).join(", ")}</p>}
            {theirs.length > 0 && <p className="small" style={{ margin: "0 0 8px", color: "var(--mild)" }}>Colleagues busy: {theirs.map((x) => `${x.name.split(" ")[0]} ${fmtTime(x.a)}–${fmtTime(x.z)}`).join(", ")}</p>}
            {Object.values(others).some((v) => v === null) && <p className="small muted" style={{ margin: "0 0 8px" }}>Some colleagues' calendars couldn't be checked.</p>}
            <div className="slots">{slots.map((s) => { const clash = theirs.filter((x) => s.t < x.z && s.t + len * 60_000 > x.a); return <button key={s.t} type="button" className={"chip slot" + (clash.length ? " partly" : "")} disabled={!s.free} aria-pressed={pick === s.t}
              title={!s.free ? "You're busy then" : clash.length ? `Busy then: ${clash.map((x) => x.name).join(", ")}` : "Everyone's free"} onClick={() => { setPick(s.t); setCustom(""); }}>{fmtTime(s.t)}</button>; })}</div>
            {!freeCount && <p className="small muted">No free times that day within working hours. Try another date, wider hours, or set a time below.</p>}
            <label style={{ marginTop: 10 }}>Or set a time<input type="time" value={custom} onChange={(e) => { setCustom(e.target.value); setPick(null); }} /></label>
            {clash && <p className="small" style={{ color: "var(--mild)", margin: 0 }}>That overlaps something in your calendar. You can still send it.</p>}
          </>}
      </div>
    </div>
    {chosen && <div className="banner" style={{ margin: 0 }}><b>{new Date(chosen).toLocaleString([], { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}</b> for {len} minutes ({tz.replace(/_/g, " ")})</div>}
    <label style={{ flexDirection: "row", alignItems: "center", gap: 8, color: "var(--ink)" }}><input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} style={{ width: "auto" }} />Add a {m.connection?.provider === "google" ? "Google Meet" : "Teams"} link</label>
    <label>Invite title<input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
    <label>Message<AiText kind="message" rows={3} value={body} onChange={(e) => setBody(e.target.value)} /></label>
    <label>Notes <span className="muted small">(just for you, not in the invite; saved on each person's timeline)</span><AiText kind="note" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Agenda, what to prepare, anything worth remembering" /></label>
    <div className="btns"><button className="btn primary" disabled={!chosen || !people.length} onClick={book}>Send invite{people.length > 1 ? ` to ${people.length} people` : ""}</button><span className="small muted">{!people.length ? "Add at least one person." : `Free times come from your calendar${colleagueEmails.length ? " and your colleagues'" : ""}. It's logged on each invited lead's timeline.`}</span></div>
  </div></Modal>;
}
