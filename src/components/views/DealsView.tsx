"use client";
import { useMemo, useState } from "react";
import { useData } from "../data";
import { Panel } from "../ui";
import { DealDialog } from "../widgets";
import { PipelineBoard } from "../PipelineBoard";
import type { DealDTO } from "@/lib/types";
import { ViewsBar } from "../ViewsBar";
import { useRouter, useSearchParams } from "next/navigation";
import { DEAL_STAGES, isOpenDeal, money, moneyShort, dv } from "../model";
import { inRange, lastYear, periodRange, PERIODS, rangeLabel, type PeriodKey } from "../periods";
import { DealPeriods } from "../DealPeriods";
import { dealMoney } from "../Payments";
import { BulkSelect } from "../BulkSelect";

export function DealsView() {
  const sp = useSearchParams(); const router = useRouter();
  const { m, q, setQ, perms } = useData();
  const linked = sp.get("id") ? m.deals.find((d) => d.id === sp.get("id")) : undefined;
  const [owner, setOwner] = useState("all"); const [team, setTeam] = useState("all"); const [closing, setClosing] = useState("all"); const [add, setAdd] = useState(false);
  // period by close date (the date entered on each deal)
  const [period, setPeriod] = useState<PeriodKey>("all"); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [by, setBy] = useState<"month" | "quarter" | "year">("month");
  const range = periodRange(period, { from, to });
  const closeOk = (cd: string | null) => {
    if (closing === "all") return true; if (!cd) return false;
    const now = new Date(); const today = now.toISOString().slice(0, 10);
    if (closing === "overdue") return cd < today;
    if (closing === "30") return cd >= today && cd <= new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
    const qEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0).toISOString().slice(0, 10);
    return cd >= today && cd <= qEnd;
  };
  const base = useMemo(() => m.deals.filter((d) => (team === "all" || d.teamId === team) && closeOk(d.closeDate) && (owner === "all" || (owner === "mine" ? d.ownerId === m.me.id : d.ownerId === owner))
    && (!q.trim() || [d.name, d.companyId ? m.companyMap.get(d.companyId)?.name : ""].join(" ").toLowerCase().includes(q.trim().toLowerCase()))), [m, q, owner, team, closing]); // eslint-disable-line react-hooks/exhaustive-deps
  const deals = range ? base.filter((d) => inRange(d.closeDate, range)) : base;
  const prev = range ? base.filter((d) => inRange(d.closeDate, lastYear(range))) : [];
  const wonIn = deals.filter((d) => d.stage === "won").reduce((n, d) => n + dv(d), 0); const wonPrev = prev.filter((d) => d.stage === "won").reduce((n, d) => n + dv(d), 0);
  const delta = range && wonPrev ? Math.round(((wonIn - wonPrev) / wonPrev) * 100) : null;
  // money: collected in the period (by the date it came in), still owed on won deals, overdue expected payments
  const baseIds = new Set(base.map((d) => d.id));
  const collected = m.payments.filter((p) => p.status === "received" && baseIds.has(p.dealId) && inRange(p.date, range)).reduce((n, p) => n + p.amount, 0);
  const owed = deals.filter((d) => d.stage === "won").reduce((n, d) => n + dealMoney(m, d).pending, 0);
  const overdueAmt = deals.reduce((n, d) => n + dealMoney(m, d).overdue, 0);
  const open = deals.filter(isOpenDeal);
  const total = open.reduce((n, d) => n + dv(d), 0), weighted = open.reduce((n, d) => n + (dv(d) * d.probability) / 100, 0);
  const wonQ = deals.filter((d) => d.stage === "won" && d.closedAt && d.closedAt > Date.now() - 90 * 86400_000).reduce((n, d) => n + dv(d), 0);
  const closed = deals.filter((d) => !isOpenDeal(d)); const winRate = closed.length ? Math.round((closed.filter((d) => d.stage === "won").length / closed.length) * 100) : 0;
  const [opened, setOpened] = useState<DealDTO | null>(null);
  return <div className="grid">
    <div className="kpis">
      {[["Open pipeline", moneyShort(total), `${open.length} open deals`, "var(--cyan)"], ["Weighted forecast", moneyShort(Math.round(weighted)), "value × probability", "var(--blue)"],
        ["Collected", moneyShort(collected), range ? "received in this period" : "received, all time", "var(--k-call)"], ["Outstanding", moneyShort(owed), overdueAmt ? `${moneyShort(overdueAmt)} overdue` : "still owed on won deals", "var(--mild)"], [range ? "Won in this period" : "Won, last 90 days", moneyShort(range ? wonIn : wonQ), range ? (delta === null ? (wonPrev ? "" : "nothing won in the same period last year") : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)}% vs same period last year (${moneyShort(wonPrev)})`) : `${deals.filter((d) => d.stage === "won").length} won all time`, "var(--warm)"], ["Win rate", `${winRate}%`, `${closed.length} closed deals`, "var(--violet)"]]
        .map(([l, v, s, c]) => <div key={l} className="panel kpi" style={{ ["--k" as string]: c }}><div className="lab">{l}</div><span className="val">{v}</span><div className="sub">{s}</div></div>)}
    </div>
    <div className="s12 inline" style={{ justifyContent: "space-between" }}>
      <select aria-label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} style={{ width: "auto", flex: "0 0 auto" }}><option value="all">Everyone</option><option value="mine">My deals</option>
        {m.users.filter((u) => u.id !== m.me.id && u.status === "active").map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}</select>
      <select aria-label="Team" value={team} onChange={(e) => setTeam(e.target.value)} style={{ width: "auto", flex: "0 0 auto" }}><option value="all">All teams</option>{m.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <select aria-label="Closing" value={closing} onChange={(e) => setClosing(e.target.value)} style={{ width: "auto", flex: "0 0 auto" }}><option value="all">Any close date</option><option value="30">Closing in 30 days</option><option value="quarter">Closing this quarter</option><option value="overdue">Close date passed</option></select>
      {perms.write && <button className="btn primary" onClick={() => setAdd(true)}>+ New deal</button>}
    </div>
    <div className="s12 periods" role="group" aria-label="Period by close date">
      {PERIODS.map(([k, l]) => <button key={k} type="button" className="chip" aria-pressed={period === k} onClick={() => setPeriod(k)}>{l}</button>)}
      {period === "custom" && <span className="inline" style={{ gap: 6 }}><label className="small muted">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" /></label>
        <label className="small muted">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" /></label></span>}
      {range && <span className="small muted">{rangeLabel(range)} · by close date · {deals.length} deal{deals.length === 1 ? "" : "s"}</span>}
    </div>
    <div className="s12"><ViewsBar page="deals" filters={{ q, owner, team, closing }} defaults={{ q: "", owner: "all", team: "all", closing: "all" }} apply={(f) => { setQ(f.q || ""); setOwner(f.owner || "all"); setTeam(f.team || "all"); setClosing(f.closing || "all"); }} />
    </div>
    <div className="s12"><BulkSelect kind="deal" noun={["deal", "deals"]} ids={deals.map((d) => d.id)}><PipelineBoard deals={deals} onOpen={setOpened} /></BulkSelect></div>
    <div className="s12"><DealPeriods deals={deals} by={by} onBy={setBy} payments={m.payments.filter((p) => baseIds.has(p.dealId) && inRange(p.date, range))} /></div>
    {add && <DealDialog onClose={() => setAdd(false)} />}
    {opened && <DealDialog deal={opened} onClose={() => setOpened(null)} />}
    {linked && <DealDialog deal={linked} onClose={() => router.push("/deals")} />}
  </div>;
}
