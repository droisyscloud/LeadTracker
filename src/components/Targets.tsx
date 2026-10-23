"use client";
import { useState } from "react";
import type { Bootstrap, TargetDTO } from "@/lib/types";
import { api, useData } from "./data";
import { money, userName, dv, toBaseC } from "./model";

/* Sales targets: progress for people and teams this month or quarter, a leaderboard, and setting targets. */
export const MEASURES: Record<TargetDTO["measure"], { label: string; money: boolean }> = { won_value: { label: "Won value", money: true }, won_deals: { label: "Deals won", money: false },
  meetings: { label: "Meetings held", money: false }, new_leads: { label: "New leads", money: false }, collected: { label: "Money collected", money: true } };
export function periodBounds(p: "month" | "quarter", now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth(); const s = p === "month" ? new Date(y, m, 1) : new Date(y, Math.floor(m / 3) * 3, 1); const e = p === "month" ? new Date(y, m + 1, 1) : new Date(y, Math.floor(m / 3) * 3 + 3, 1);
  return { start: s.getTime(), end: e.getTime(), label: p === "month" ? s.toLocaleDateString("en-US", { month: "long", year: "numeric" }) : `Q${Math.floor(m / 3) + 1} ${y}` };
}
/** How much a set of people achieved on a measure in a period. */
export function achieved(m: Bootstrap, people: Set<string>, measure: TargetDTO["measure"], p: "month" | "quarter") {
  const { start, end } = periodBounds(p); const inP = (t: number) => t >= start && t < end;
  const dealOwner = (id: string) => m.deals.find((d) => d.id === id)?.ownerId || "";
  if (measure === "won_value" || measure === "won_deals") { const won = m.deals.filter((d) => d.stage === "won" && d.closedAt && inP(d.closedAt) && people.has(d.ownerId || "")); return measure === "won_deals" ? won.length : won.reduce((n, d) => n + dv(d), 0); }
  if (measure === "meetings") return m.activities.filter((a) => a.type === "meeting" && inP(a.at) && people.has(a.byId || "")).length;
  if (measure === "new_leads") return m.contacts.filter((c) => inP(c.createdAt) && people.has(c.ownerId || "")).length;
  return m.payments.filter((x) => x.status === "received" && inP(new Date(`${x.date}T12:00:00`).getTime()) && people.has(dealOwner(x.dealId))).reduce((n, x) => n + toBaseC(m, x.amount, m.deals.find((d) => d.id === x.dealId)?.currency), 0);
}
const fmt = (measure: TargetDTO["measure"], n: number) => (MEASURES[measure].money ? money(n) : Math.round(n).toLocaleString());
function Bar({ pct }: { pct: number }) { return <div className="tg-track"><div className={"tg-fill" + (pct >= 100 ? " done" : pct >= 70 ? " near" : "")} style={{ width: `${Math.min(100, pct)}%` }} /></div>; }

export function TargetsView() {
  const { m, run, perms } = useData(); const targets = (m.targets || []).filter((t) => !MEASURES[t.measure].money || perms.money);
  const [f, setF] = useState({ scope: "user", who: "", measure: "won_value", period: "month", amount: "" });
  const rows = targets.map((t) => { const people = new Set(t.scope === "user" ? [t.userId || ""] : (m.teams.find((x) => x.id === t.teamId)?.memberIds || []));
    const got = achieved(m, people, t.measure, t.period); return { t, got, pct: t.amount ? Math.round((got / t.amount) * 100) : 0, name: t.scope === "user" ? userName(m, t.userId) : `${m.teams.find((x) => x.id === t.teamId)?.name || "Team"} (team)` }; });
  const groups = (Object.keys(MEASURES) as TargetDTO["measure"][]).flatMap((ms) => (["month", "quarter"] as const).map((p) => ({ ms, p, list: rows.filter((r) => r.t.measure === ms && r.t.period === p).sort((a, b) => b.pct - a.pct) }))).filter((g) => g.list.length);
  return <div className="dir">
    {perms.manage && <section className="panel ps-form"><h3 className="wide" style={{ margin: 0 }}>Set a target</h3>
      <label>For<select value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value, who: "" })}><option value="user">A person</option><option value="team">A team</option></select></label>
      <label>Who<select value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })}><option value="">Choose…</option>{(f.scope === "user" ? m.users.filter((u) => u.status === "active").map((u) => [u.id, userName(m, u.id)]) : m.teams.map((t) => [t.id, t.name])).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>
      <label>Measure<select value={f.measure} onChange={(e) => setF({ ...f, measure: e.target.value })}>{(Object.keys(MEASURES) as TargetDTO["measure"][]).filter((k) => !MEASURES[k].money || perms.money).map((k) => <option key={k} value={k}>{MEASURES[k].label}</option>)}</select></label>
      <label>Every<select value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })}><option value="month">Month</option><option value="quarter">Quarter</option></select></label>
      <label>Target<input type="number" min="0" step="any" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
      <div className="btns wide"><button type="button" className="btn primary" disabled={!f.who || !f.amount} onClick={async () => { if (await run(() => api("/api/targets", { json: { scope: f.scope, userId: f.scope === "user" ? f.who : null, teamId: f.scope === "team" ? f.who : null, measure: f.measure, period: f.period, amount: Number(f.amount) } }), "Target set")) setF({ ...f, who: "", amount: "" }); }}>Set target</button></div></section>}
    {groups.map((g) => <section key={g.ms + g.p} className="panel"><h3>{MEASURES[g.ms].label} · {periodBounds(g.p).label}</h3>
      <div className="tg-list">{g.list.map((r, i) => <div key={r.t.id} className="tg-row"><span className="tg-rank">{i + 1}</span><b className="tg-name">{r.name}</b><Bar pct={r.pct} />
        <span className="tg-val num">{fmt(g.ms, r.got)} <span className="muted">/ {fmt(g.ms, r.t.amount)}</span></span><span className={"tg-pct" + (r.pct >= 100 ? " done" : "")}>{r.pct}%</span>
        {perms.manage && <button type="button" className="linkbtn small" onClick={() => run(() => api(`/api/targets/${r.t.id}`, { method: "DELETE" }), "Removed")}>Remove</button>}</div>)}</div></section>)}
    {!groups.length && <p className="muted">No targets yet.{perms.manage ? " Set one above." : " Your manager can set them."}</p>}
  </div>;
}
/** "Your targets" on Home. */
export function MyTargets() {
  const { m, perms } = useData(); const mine = (m.targets || []).filter((t) => t.scope === "user" && t.userId === m.me.id && (!MEASURES[t.measure].money || perms.money));
  if (!mine.length) return null;
  return <section className="panel tg-home"><h3>Your targets</h3>{mine.map((t) => { const got = achieved(m, new Set([m.me.id]), t.measure, t.period); const pct = t.amount ? Math.round((got / t.amount) * 100) : 0;
    return <div key={t.id} className="tg-row"><b className="tg-name">{MEASURES[t.measure].label} <span className="small muted">{periodBounds(t.period).label}</span></b><Bar pct={pct} /><span className="tg-val num">{fmt(t.measure, got)} <span className="muted">/ {fmt(t.measure, t.amount)}</span></span><span className={"tg-pct" + (pct >= 100 ? " done" : "")}>{pct}%</span></div>; })}</section>;
}
