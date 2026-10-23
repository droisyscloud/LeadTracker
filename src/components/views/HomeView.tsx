"use client";
import { ChartHover } from "@/components/ChartHover";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useData } from "../data";
import { Panel } from "../ui";
import { FollowRow } from "../FollowRow";
import { TaskList } from "../widgets";
import { AISummary } from "../AISummary";
import { scopeModel, isOpenDeal, moneyShort, taskDueToday, taskOverdue, ago, coName, DAY, daysSince, dueReason, isDue, STAGES, TYPES, userName, webHref, webLabel, type Model, dv, uniqueMeetings } from "../model";
import { TodayCockpit } from "../TodayCockpit";
import { MyTargets } from "../Targets";
import { SuggestionsHint } from "../CalendarSuggestions";

function Kpi({ label, value, pct, suffix, sub, color }: { label: string; value: number; pct?: boolean; suffix?: string; sub: React.ReactNode; color: string }) {
  const sfx = pct ? "%" : suffix ? suffix : "";
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || sessionStorage.getItem("lt-counted")) { el.textContent = (suffix ? "$" : "") + value + sfx; return; }
    const t0 = performance.now(); let raf = 0;
    const step = (t: number) => { const p = Math.min(1, (t - t0) / 700), n = Math.round(value * (1 - Math.pow(1 - p, 3))); el.textContent = (suffix ? "$" : "") + n + sfx; if (p < 1) raf = requestAnimationFrame(step); else sessionStorage.setItem("lt-counted", "1"); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [value, pct, suffix, sfx]);
  return <div className="panel kpi" style={{ ["--k" as string]: color }}><div className="lab">{label}</div><span className="val" ref={ref}>{suffix ? "$" : ""}{value}{sfx}</span><div className="sub">{sub}</div></div>;
}

function Ring({ pct, label }: { pct: number; label: string }) {
  const r = 62, c = 2 * Math.PI * r;
  return <div className="ring"><svg viewBox="0 0 150 150" role="img" aria-label={`${label} ${pct}%`}>
    <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--blue)" /><stop offset="1" stopColor="var(--cyan)" /></linearGradient></defs>
    <circle cx="75" cy="75" r={r} fill="none" stroke="var(--chip)" strokeWidth="12" />
    {pct > 0 && <circle cx="75" cy="75" r={r} fill="none" stroke="url(#rg)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(c * pct) / 100} ${c}`} />}
  </svg><div className="c"><b>{pct}%</b><span>{label}</span></div></div>;
}

function ActivityChart({ m }: { m: Model }) {
  const days = 14, W = 640, H = 170, pad = 24;
  const start = new Date(); start.setHours(0, 0, 0, 0); const t0 = start.getTime() - (days - 1) * DAY;
  const b = Array.from({ length: days }, () => ({ email: 0, call: 0, other: 0 }));
  for (const a of m.activities) { if (!a.byId || a.at < t0) continue; const i = Math.floor((a.at - t0) / DAY); if (i < 0 || i >= days) continue; b[i][a.type === "email" ? "email" : a.type === "call" ? "call" : "other"]++; }
  const max = Math.max(4, ...b.map((x) => x.email + x.call + x.other)); const bw = (W - pad * 2) / days;
  const cols = { email: "var(--k-email-out)", call: "var(--k-call)", other: "var(--k-meeting)" } as const;
  const total = b.reduce((n, x) => n + x.email + x.call + x.other, 0);
  return <div className="chart">
    <ChartHover n={days} at={(i) => ((pad + i * bw + bw / 2) / W) * 100} bottom={(22 / (H + 22)) * 100} tip={(i) => { const x = b[i]; const d = new Date(t0 + i * DAY); return <><b>{d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</b><br /><i className="ch-k" style={{ background: "var(--k-email-out)" }} />Emails {x.email}<br /><i className="ch-k" style={{ background: "var(--k-call)" }} />Calls {x.call}<br /><i className="ch-k" style={{ background: "var(--k-meeting)" }} />Other {x.other}</>; }}>
    <svg viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label="Team activity over the last 14 days">
      {[0, 1, 2, 3, 4].map((g) => { const y = pad / 2 + ((H - pad) * g) / 4; return <line key={g} x1={pad} x2={W - pad} y1={y} y2={y} stroke="var(--line)" />; })}
      {b.map((x, i) => { let y = H - pad / 2; const rects = (["email", "call", "other"] as const).map((k) => { if (!x[k]) return null; const hh = ((H - pad) * x[k]) / max; y -= hh; return <rect key={k} x={pad + i * bw + bw * 0.2} y={y} width={bw * 0.6} height={Math.max(hh - 1, 1)} rx={3} fill={cols[k]} />; });
        const d = new Date(t0 + i * DAY);
        return <g key={i}>{rects}{(i % 2 === days % 2 || i === days - 1) && <text x={pad + i * bw + bw / 2} y={H + 14} textAnchor="middle" fontSize="11" fill="var(--muted)" fontFamily="Space Grotesk, Arial">{d.toLocaleDateString([], { month: "short", day: "numeric" })}</text>}</g>; })}
    </svg></ChartHover>
    <div className="legend"><span><i className="dot" style={{ background: "var(--k-email-out)" }} />Emails</span><span><i className="dot" style={{ background: "var(--k-call)" }} />Calls</span><span><i className="dot" style={{ background: "var(--k-meeting)" }} />Replies, meetings, requests, notes</span><span className="muted">{total} logged in 14 days</span></div>
  </div>;
}

export function HomeView() {
  const { m: full } = useData();
  const sp = useSearchParams();
  const [team, setTeam] = useState(sp.get("team") || "");
  const m = useMemo(() => scopeModel(full, team), [full, team]);
  const all = m.contacts; const wk = Date.now() - 7 * DAY;
  let emails = 0, sent = 0, opened = 0, bounced = 0, replies = 0, calls = 0, connected = 0, openReq = 0, meetings = 0, emailed = 0, replied = 0;
  for (const c of all) { const s = m.stats.get(c.id); if (!s) continue; emails += s.emails; sent += s.sent; opened += s.opened; bounced += s.bounced; replies += s.replies; calls += s.calls; connected += s.connected; openReq += s.openReq; meetings += s.meetings; if (s.emails) emailed++; if (s.emails && s.replies) replied++; }
  const wkActs = m.activities.filter((a) => a.at >= wk && a.byId);
  { const ids = new Set(all.map((c) => c.id)); meetings = uniqueMeetings(m.activities.filter((a) => a.type === "meeting" && ids.has(a.contactId))).length; }   // one meeting with 14 people is 1
  const contacted = all.filter((c) => m.stats.get(c.id)?.outbound).length;
  const due = all.filter((c) => isDue(m, c)).sort((a, b) => (a.nextFollowUp || "0").localeCompare(b.nextFollowUp || "0") || daysSince(m, b) - daysSince(m, a));
  const won = all.filter((c) => c.status === "won").length;
  const rate = emailed ? Math.round((replied / emailed) * 100) : 0;
  const openDeals = m.deals.filter(isOpenDeal);
  const myTasks = m.tasks.filter((t) => t.assigneeId === m.me.id && !t.done).sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const counts = STAGES.map((s) => ({ s, n: all.filter((c) => c.status === s[0]).length })); const maxS = Math.max(1, ...counts.map((x) => x.n));
  const prods = m.products.map((p) => ({ p, n: all.filter((c) => c.productIds.includes(p.id)).length })).sort((a, b) => b.n - a.n); const maxP = Math.max(1, ...prods.map((x) => x.n));
  const people = new Map<string, { email: number; call: number; other: number; wk: number }>();
  for (const a of m.activities) { if (!a.byId) continue; const p = people.get(a.byId) || { email: 0, call: 0, other: 0, wk: 0 }; if (a.type === "email") p.email++; else if (a.type === "call") p.call++; else p.other++; if (a.at >= wk) p.wk++; people.set(a.byId, p); }
  const reqs = m.activities.filter((a) => a.type === "request" && !a.done && m.contactMap.has(a.contactId)).slice(0, 5);
  const coRows = m.companies.map((co) => { const ppl = all.filter((c) => c.companyId === co.id); const ids = new Set(ppl.map((p) => p.id)); const touches = m.activities.filter((a) => a.byId && ids.has(a.contactId)).length;
    const best = ppl.reduce((b, c) => (c.status === "lost" ? b : Math.max(b, STAGES.findIndex((s) => s[0] === c.status))), -1); return { co, ppl, touches, best }; })
    .sort((a, b) => b.touches - a.touches || b.ppl.length - a.ppl.length).slice(0, 6);
  const recent = m.activities.filter((a) => m.contactMap.has(a.contactId)).slice(0, 8);
  const pctOf = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
  const Step = ({ l, n, of, col }: { l: string; n: number; of: number; col: string }) => <li><span>{l}</span><span className="num">{n}</span><span className="trk"><i style={{ width: pctOf(n, of) + "%", background: col }} /></span></li>;

  return <div className="grid">
    <SuggestionsHint />
    {!team && <div className="s12"><TodayCockpit m={m} /></div>}
    <div className="s12 inline" style={{ justifyContent: "space-between" }}><div className="inline"><span className="small muted">Showing</span>
      <select aria-label="Team" value={team} onChange={(e) => setTeam(e.target.value)} style={{ width: "auto", flex: "0 0 auto" }}><option value="">All teams</option>{full.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      {team && full.teamMap.get(team) && <span className="small muted">{full.teamMap.get(team)!.memberIds.length} members · <Link className="linkbtn" href={`/teams?id=${team}`}>Team page</Link></span>}</div></div>
    <AISummary key={team || "all"} scope={team ? "team" : "dashboard"} id={team || null} className="s12" />
    <MyTargets />
    <div className="kpis">
      <Kpi label="Leads" value={all.length} color="var(--cyan)" sub={<><b>+{all.filter((c) => c.createdAt >= wk).length}</b> this week</>} />
      <Kpi label="Open pipeline" value={Math.round(openDeals.reduce((n, d) => n + dv(d), 0) / 1000)} suffix="k" color="var(--violet)" sub={<><b>{moneyShort(Math.round(openDeals.reduce((n, d) => n + (dv(d) * d.probability) / 100, 0)))}</b> weighted, {openDeals.length} deals</>} />
      <Kpi label="Contacted" value={pctOf(contacted, all.length)} pct color="var(--blue)" sub={<><b>{contacted}</b> of {all.length} leads</>} />
      <Kpi label="Emails" value={emails} color="var(--blue)" sub={<><b>{sent}</b> sent from here, {opened} opened</>} />
      <Kpi label="Calls" value={calls} color="var(--cyan)" sub={<><b>{connected}</b> connected, +{wkActs.filter((a) => a.type === "call").length} this week</>} />
      <Kpi label="Due today" value={due.length} color={due.length ? "var(--cold)" : "var(--warm)"} sub={<><b>{meetings}</b> meetings, {won} won</>} />
    </div>
    <Panel className="s5" title="Email performance" sub="Reply rate is leads who replied out of leads emailed.">
      <div className="ringwrap"><Ring pct={rate} label="reply rate" /><ul className="steps">
        <Step l="Leads emailed" n={emailed} of={all.length} col="var(--blue)" />
        <Step l="Emails logged or sent" n={emails} of={Math.max(emails, 1)} col="var(--blue)" />
        <Step l="Opened" n={opened} of={Math.max(sent, 1)} col="var(--cyan)" />
        <Step l="Replies received" n={replies} of={Math.max(emails, 1)} col="var(--warm)" />
        <Step l="Bounced" n={bounced} of={Math.max(emails, 1)} col="var(--cold)" />
      </ul></div>
      {!m.config.openTracking && <p className="small muted" style={{ margin: "10px 0 0" }}>Open tracking is turned off on this server.</p>}
    </Panel>
    <Panel className="s7" title="Team activity, last 14 days"><ActivityChart m={m} /></Panel>
    <Panel className="s5" title="Follow up today" sub={`${due.length} due or not contacted yet`} action={<Link className="linkbtn" href="/followups">See all</Link>}>
      {due.length ? <ul className="fr-list">{due.slice(0, 6).map((c) => <FollowRow key={c.id} m={m} c={c} reason={dueReason(m, c)} />)}</ul> : <p className="empty">All caught up.</p>}
    </Panel>
    <Panel className="s4" title={`My tasks (${myTasks.length})`} sub={`${myTasks.filter(taskOverdue).length} overdue, ${myTasks.filter(taskDueToday).length} due today`} action={<Link className="linkbtn" href="/tasks">All tasks</Link>}>
      <TaskList tasks={myTasks.slice(0, 5)} />
    </Panel>
    <Panel className="s3" title="Leaderboard" action={<Link className="linkbtn" href="/team">Team</Link>}>
      {people.size ? <table className="tbl"><thead><tr><th>Person</th><th className="n">Emails</th><th className="n">Calls</th><th className="n">7 days</th></tr></thead>
        <tbody>{[...people.entries()].sort((a, b) => b[1].email + b[1].call + b[1].other - (a[1].email + a[1].call + a[1].other)).slice(0, 6).map(([id, p]) => <tr key={id}><td>{userName(full, id)}</td><td className="n">{p.email}</td><td className="n">{p.call}</td><td className="n">{p.wk}</td></tr>)}</tbody></table>
        : <p className="empty">Activity your team logs is ranked here.</p>}
    </Panel>
    <Panel className="s4" title="Open requests" action={<span className="num muted">{openReq}</span>}>
      {reqs.length ? <ul className="feed">{reqs.map((a) => { const c = m.contactMap.get(a.contactId)!; return <li key={a.id}><Link className="linkbtn" href={`/contacts?id=${c.id}`}>{c.name}</Link><div className="muted small">{a.kind || "Request"} · {ago(a.at)}</div></li>; })}</ul> : <p className="empty">No open requests.</p>}
    </Panel>
    <Panel className="s4" title="Pipeline" action={<span className="muted small">{all.length} leads</span>}>
      <ul className="bars">{counts.map(({ s, n }) => <li key={s[0]}><Link href={`/contacts?stage=${s[0]}`} style={{ color: "inherit", textDecoration: "none", display: "block" }}>
        <span className="lbl"><span><i className="dot" style={{ background: s[2], marginRight: 8 }} />{s[1]}</span><span className="num muted">{n}</span></span>
        <span className="trk"><i style={{ width: (n / maxS) * 100 + "%", background: s[2] }} /></span></Link></li>)}</ul>
    </Panel>
    <Panel className="s4" title="Interest by product" action={<Link className="linkbtn" href="/products">Open products</Link>}>
      {prods.length ? <ul className="bars">{prods.map(({ p, n }) => <li key={p.id}><Link href={`/products?id=${p.id}`} style={{ color: "inherit", textDecoration: "none", display: "block" }}>
        <span className="lbl"><span>{p.name}</span><span className="num muted">{n}</span></span><span className="trk"><i style={{ width: (n / maxP) * 100 + "%" }} /></span></Link></li>)}</ul>
        : <p className="empty">Add products and tag leads to see interest here.</p>}
    </Panel>
    <Panel className="s6" title="Top companies" action={<Link className="linkbtn" href="/companies">All companies</Link>}>
      {coRows.length ? <table className="tbl"><thead><tr><th>Company</th><th className="n">People</th><th className="n">Touches</th><th>Stage</th></tr></thead>
        <tbody>{coRows.map(({ co, ppl, touches, best }) => <tr key={co.id}><td><Link className="colink" href={`/companies?id=${co.id}`}>{co.name}</Link>{co.website && <div className="small"><a href={webHref(co.website)} target="_blank" rel="noopener noreferrer">{webLabel(co.website)}</a></div>}</td>
          <td className="n">{ppl.length}</td><td className="n">{touches}</td><td><span className="pill">{best >= 0 ? STAGES[best][1] : "Not now"}</span></td></tr>)}</tbody></table>
        : <p className="empty">Companies show up as leads are added.</p>}
    </Panel>
    <Panel className="s6" title="Recent activity">
      {recent.length ? <ul className="feed">{recent.map((a) => { const c = m.contactMap.get(a.contactId)!; return <li key={a.id}><strong>{a.byId ? userName(m, a.byId) : a.origin === "intake" ? "Website form" : "Badge import"}</strong> · {TYPES[a.type].label} · <Link className="linkbtn" href={`/contacts?id=${c.id}`}>{c.name}</Link><span className="muted small"> · {coName(m, c)} · {ago(a.at)}</span></li>; })}</ul> : <p className="empty">Nothing logged yet.</p>}
    </Panel>
  </div>;
}
