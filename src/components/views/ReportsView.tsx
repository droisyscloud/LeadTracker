"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useData } from "../data";
import { Panel } from "../ui";
import { scopeModel, teamMetrics, DAY, isOpenDeal, LOSS_REASONS, money, moneyShort, STAGE_RANK, userName, WIN_REASONS, dv } from "../model";

function Bars({ rows, fmt = String }: { rows: [string, number][]; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return rows.length ? <ul className="bars">{rows.map(([l, n]) => <li key={l}><span className="lbl"><span>{l}</span><span className="num muted">{fmt(n)}</span></span><span className="trk"><i style={{ width: (n / max) * 100 + "%" }} /></span></li>)}</ul> : <p className="empty">No data yet.</p>;
}

export function ReportsView() {
  const { m: full } = useData();
  const [team, setTeam] = useState("");
  const m = useMemo(() => scopeModel(full, team), [full, team]);
  const bySource = new Map<string, { leads: number; contacted: number; meetings: number; won: number; value: number }>();
  for (const c of m.contacts) {
    const k = c.source || "Unknown"; const r = bySource.get(k) || { leads: 0, contacted: 0, meetings: 0, won: 0, value: 0 };
    r.leads++; if (m.stats.get(c.id)?.outbound) r.contacted++; if (STAGE_RANK[c.status] >= STAGE_RANK.meeting && c.status !== "lost") r.meetings++; if (c.status === "won") r.won++;
    r.value += m.deals.filter((d) => d.contactId === c.id && d.stage === "won").reduce((n, d) => n + dv(d), 0); bySource.set(k, r);
  }
  const refs = new Map<string, number>(); for (const c of m.contacts) if (c.referredBy) refs.set(c.referredBy, (refs.get(c.referredBy) || 0) + 1);
  const reasons = (outcome: "won" | "lost", list: string[]) => { const map = new Map(list.map((r) => [r, 0]));
    for (const c of m.contacts) if (c.status === outcome && c.outcomeReason) map.set(c.outcomeReason, (map.get(c.outcomeReason) || 0) + 1);
    for (const d of m.deals) if (d.stage === outcome && d.outcomeReason) map.set(d.outcomeReason, (map.get(d.outcomeReason) || 0) + 1);
    return [...map.entries()].filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]); };
  const months: { key: string; label: string; weighted: number; total: number }[] = [];
  const now = new Date(); for (let i = 0; i < 6; i++) { const d = new Date(now.getFullYear(), now.getMonth() + i, 1); months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString([], { month: "short", year: "2-digit" }), weighted: 0, total: 0 }); }
  let undated = 0;
  for (const d of m.deals.filter(isOpenDeal)) { const mo = months.find((x) => x.key === d.closeDate?.slice(0, 7)); if (mo) { mo.total += d.value; mo.weighted += (dv(d) * d.probability) / 100; } else undated += d.value; }
  const maxM = Math.max(1, ...months.map((x) => x.total));
  const since = Date.now() - 30 * DAY;
  const tm = team ? full.teamMap.get(team) : undefined;
  const reps = m.users.filter((u) => u.status === "active" && u.role !== "viewer" && (!tm || tm.memberIds.includes(u.id))).map((u) => { const a = m.activities.filter((x) => x.byId === u.id && x.at >= since);
    const ds = m.deals.filter((d) => d.ownerId === u.id);
    return { u, emails: a.filter((x) => x.type === "email").length, calls: a.filter((x) => x.type === "call").length, meetings: a.filter((x) => x.type === "meeting").length,
      owned: m.contacts.filter((c) => c.ownerId === u.id).length, pipe: ds.filter(isOpenDeal).reduce((n, d) => n + dv(d), 0), won: ds.filter((d) => d.stage === "won").reduce((n, d) => n + dv(d), 0) }; })
    .sort((a, b) => b.won - a.won || b.pipe - a.pipe);
  return <div className="grid">
    <div className="s12 inline" style={{ justifyContent: "space-between" }}><div className="inline"><span className="small muted">Showing</span>
      <select aria-label="Team" value={team} onChange={(e) => setTeam(e.target.value)} style={{ width: "auto", flex: "0 0 auto" }}><option value="">All teams</option>{full.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      {team && full.teamMap.get(team) && <span className="small muted">{full.teamMap.get(team)!.memberIds.length} members · <Link className="linkbtn" href={`/teams?id=${team}`}>Team page</Link></span>}</div></div>
    {!team && full.teams.length > 0 && <Panel className="s12" title="Teams compared" sub="Won value against target, open pipeline and reply rate per team.">
      <Bars rows={full.teams.map((t) => [t.name, teamMetrics(full, t.id).won + teamMetrics(full, t.id).openPipe] as [string, number]).sort((a, b) => b[1] - a[1])} fmt={(n) => money(n) + " won + open"} />
    </Panel>}
    <Panel className="s12" title="Forecast by expected close month" sub={`Open deals only. Bar = total value, bright part = weighted by probability.${undated ? ` ${money(undated)} has no close date or closes later.` : ""}`}>
      {months.every((mo) => !mo.total) ? <p className="empty" style={{ textAlign: "left" }}>No open deals are expected to close in the next six months. Add a close date to open deals on the Deals page to see the forecast here.</p>
      : <div className="fc-chart">
        {months.map((mo) => <div key={mo.key} className="fc-col">
          <span className="small num" title="Total value, then weighted by probability">{mo.total ? <>{moneyShort(mo.total)}<br /><span className="muted">{moneyShort(Math.round(mo.weighted))} weighted</span></> : <span className="muted">none</span>}</span>
          <div style={{ height: `${(mo.total / maxM) * 140 + 2}px`, background: "var(--chip)", borderRadius: 6, position: "relative", overflow: "hidden" }} title={`${money(mo.total)} total`}>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${mo.total ? (mo.weighted / mo.total) * 100 : 0}%`, background: "linear-gradient(180deg,var(--cyan),var(--blue))" }} /></div>
          <span className="small muted">{mo.label}</span></div>)}
      </div>}
    </Panel>
    <Panel className="s7" title="Lead sources" sub="Where leads come from and how far they get.">
      <div style={{ overflowX: "auto" }}><table className="tbl"><thead><tr><th>Source</th><th className="n">Leads</th><th className="n">Contacted</th><th className="n">Meeting or later</th><th className="n">Won</th><th className="n">Won value</th></tr></thead>
        <tbody>{[...bySource.entries()].sort((a, b) => b[1].leads - a[1].leads).map(([k, r]) => <tr key={k}><td>{k}</td><td className="n">{r.leads}</td><td className="n">{r.contacted}</td><td className="n">{r.meetings} <span className="muted small">({r.leads ? Math.round((r.meetings / r.leads) * 100) : 0}%)</span></td><td className="n">{r.won}</td><td className="n">{money(r.value)}</td></tr>)}</tbody></table></div>
    </Panel>
    <Panel className="s5" title="Top introducers" sub="Who referred leads to us."><Bars rows={[...refs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)} /></Panel>
    <Panel className="s6" title="Why we win" sub="Reasons recorded on won leads and deals."><Bars rows={reasons("won", WIN_REASONS)} /></Panel>
    <Panel className="s6" title="Why we lose" sub="Reasons recorded on leads marked Not now and lost deals."><Bars rows={reasons("lost", LOSS_REASONS)} /></Panel>
    <Panel className="s12" title="Team performance" sub="Activity in the last 30 days; pipeline and won value all time.">
      <div style={{ overflowX: "auto" }}><table className="tbl"><thead><tr><th>Person</th><th className="n">Leads owned</th><th className="n">Emails</th><th className="n">Calls</th><th className="n">Meetings</th><th className="n">Open pipeline</th><th className="n">Won</th></tr></thead>
        <tbody>{reps.map((r) => <tr key={r.u.id}><td>{userName(m, r.u.id)}</td><td className="n">{r.owned}</td><td className="n">{r.emails}</td><td className="n">{r.calls}</td><td className="n">{r.meetings}</td><td className="n">{money(r.pipe)}</td><td className="n">{money(r.won)}</td></tr>)}</tbody></table></div>
    </Panel>
  </div>;
}
