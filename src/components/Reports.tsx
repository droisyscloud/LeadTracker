"use client";
import { ChartHover } from "@/components/ChartHover";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { api, useData } from "./data";
import { groupsFor, GROUPS, MEASURES, runReport, type Chart, type GroupBy, type Measure, type ReportDef, type ReportResult } from "@/lib/reportEngine";
import { PERIODS, type PeriodKey } from "./periods";

type Saved = { id: string; ownerId: string; name: string; def: ReportDef; shared: boolean; schedule: { freq: "weekly" | "monthly"; weekday?: number; recipients: string[]; toDrive?: boolean } | null; lastSentAt: number | null };
type Dash = { id: string; name: string; reportIds: string[]; linkOn: boolean; url: string };
const COLORS = ["#4C8DF0", "#3DDCA0", "#A78BFA", "#F5B451", "#FF6FB5", "#38D6F5", "#FF8A5B", "#A3E635", "#9AA8C2", "#5B8CFF", "#F2C14E", "#2FC6A8", "#C084FC", "#FB7185", "#94A3B8"];
const fmt = (r: ReportResult, v: number) => (r.money ? (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : `$${Math.round(v)}`) : Math.round(v).toLocaleString());
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Bars, a line, a donut or a table for one report's result. */
export function ReportChart({ r, chart }: { r: ReportResult; chart: Chart }) {
  if (!r.rows.length) return <p className="empty" style={{ margin: 0 }}>No data for this selection.</p>;
  const max = Math.max(1, ...r.rows.map((x) => x.value));
  if (chart === "table") return <div className="tbl-wrap"><table className="tbl rep-tbl"><thead><tr><th>Group</th><th className="n">Value</th><th className="n">Count</th></tr></thead>
    <tbody>{r.rows.map((x) => <tr key={x.key}><td>{x.label}</td><td className="n num">{fmt(r, x.value)}</td><td className="n">{x.count}</td></tr>)}</tbody>
    <tfoot><tr><td><b>Total</b></td><td className="n num"><b>{fmt(r, r.total)}</b></td><td className="n">{r.count}</td></tr></tfoot></table></div>;
  if (chart === "donut") {
    let a = 0; const R = 60, C = 2 * Math.PI * R;
    return <div className="rep-donut"><svg viewBox="0 0 160 160" width="170" height="170" role="img" aria-label={r.title}>
      <circle cx="80" cy="80" r={R} fill="none" stroke="var(--chip)" strokeWidth="22" />
      {r.rows.map((x, i) => { const len = (x.value / Math.max(1, r.total)) * C; const el = <circle key={x.key} cx="80" cy="80" r={R} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth="22" strokeDasharray={`${len} ${C}`} strokeDashoffset={-a} transform="rotate(-90 80 80)" />; a += len; return el; })}
      <text x="80" y="78" textAnchor="middle" className="rep-donut-v">{fmt(r, r.total)}</text><text x="80" y="96" textAnchor="middle" className="rep-donut-l">total</text></svg>
      <ul className="rep-legend">{r.rows.map((x, i) => <li key={x.key}><i style={{ background: COLORS[i % COLORS.length] }} />{x.label}<b className="num">{fmt(r, x.value)}</b></li>)}</ul></div>;
  }
  if (chart === "line" && r.rows.length > 1) {
    const W = 600, H = 200, P = 28; const step = (W - P * 2) / (r.rows.length - 1);
    const pts = r.rows.map((x, i) => [P + i * step, H - P - (x.value / max) * (H - P * 2)]);
    return <ChartHover n={r.rows.length} at={(i) => ((P + i * step) / W) * 100} bottom={(18 / (H + 18)) * 100} tip={(i) => <><b>{r.rows[i].label}</b><br />{fmt(r, r.rows[i].value)}{i ? <><br /><span className="muted">{r.rows[i].value - r.rows[i - 1].value >= 0 ? "+" : ""}{fmt(r, r.rows[i].value - r.rows[i - 1].value)} vs {r.rows[i - 1].label}</span></> : null}</>}><svg viewBox={`0 0 ${W} ${H + 18}`} className="rep-line" role="img" aria-label={r.title}>
      {[0, 0.5, 1].map((g) => <line key={g} x1={P} x2={W - P} y1={P + (H - P * 2) * g} y2={P + (H - P * 2) * g} stroke="var(--line)" />)}
      <polyline fill="none" stroke="var(--cyan)" strokeWidth="3" strokeLinejoin="round" points={pts.map((p) => p.join(",")).join(" ")} />
      {pts.map((p, i) => <g key={i}><circle cx={p[0]} cy={p[1]} r="4" fill="var(--cyan)" /><text x={p[0]} y={p[1] - 9} textAnchor="middle" className="rep-pt">{fmt(r, r.rows[i].value)}</text>
        <text x={p[0]} y={H + 12} textAnchor="middle" className="rep-ax">{r.rows[i].label}</text></g>)}</svg></ChartHover>;
  }
  return <div className="rep-bars">{r.rows.map((x, i) => <div key={x.key} className="rep-bar"><span className="rb-l" title={x.label}>{x.label}</span>
    <span className="rb-t"><i style={{ width: `${(x.value / max) * 100}%`, background: COLORS[i % COLORS.length] }} /></span><b className="num">{fmt(r, x.value)}</b></div>)}</div>;
}

const DEFAULT: ReportDef = { measure: "won", groupBy: "month", chart: "bar", period: "this-year" };
const DEFAULT_NO_MONEY: ReportDef = { measure: "leads", groupBy: "month", chart: "bar", period: "this-year" };
/** Pick what to count, how to group it, filters and a chart; see it straight away; save it. */
function Builder({ edit, onSaved }: { edit: Saved | null; onSaved: () => void }) {
  const { m, run, perms } = useData();
  const [def, setDef] = useState<ReportDef>(edit?.def || (perms.money ? DEFAULT : DEFAULT_NO_MONEY)); const [name, setName] = useState(edit?.name || ""); const [shared, setShared] = useState(edit?.shared || false);
  useEffect(() => { setDef(edit?.def || (perms.money ? DEFAULT : DEFAULT_NO_MONEY)); setName(edit?.name || ""); setShared(edit?.shared || false); }, [edit]);
  const allowed = groupsFor(def.measure);
  const result = useMemo(() => runReport(m, def, m.me.id), [m, def]);
  const set = (p: Partial<ReportDef>) => { const n = { ...def, ...p }; if (!groupsFor(n.measure).includes(n.groupBy)) n.groupBy = groupsFor(n.measure)[1] || "none"; setDef(n); };
  const save = async () => {
    const payload = { name: name.trim() || result.title, def, shared };
    if (await run(() => edit ? api(`/api/reports/${edit.id}`, { method: "PATCH", json: payload }) : api("/api/reports", { json: payload }), edit ? "Report updated" : "Report saved")) { if (!edit) setName(""); onSaved(); }
  };
  return <section className="panel rep-builder">
    <div className="rb-controls">
      <label>Count<select aria-label="What to count" value={def.measure} onChange={(e) => set({ measure: e.target.value as Measure })}>{MEASURES.filter(([, , money]) => perms.money || !money).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label>Grouped by<select aria-label="Group by" value={def.groupBy} onChange={(e) => set({ groupBy: e.target.value as GroupBy })}>{GROUPS.filter(([k]) => allowed.includes(k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label>Period<select aria-label="Period" value={def.period} onChange={(e) => set({ period: e.target.value as PeriodKey })}>{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      {def.period === "custom" && <><label>From<input type="date" value={def.from || ""} onChange={(e) => set({ from: e.target.value })} /></label><label>To<input type="date" value={def.to || ""} onChange={(e) => set({ to: e.target.value })} /></label></>}
      <label>Person<select aria-label="Person" value={def.owner || ""} onChange={(e) => set({ owner: e.target.value || undefined })}><option value="">Everyone</option><option value="mine">Me</option>{m.users.filter((u) => u.status === "active").map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}</select></label>
      {m.teams.length > 0 && <label>Team<select aria-label="Team" value={def.team || ""} onChange={(e) => set({ team: e.target.value || undefined })}><option value="">Any team</option>{m.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
      <label>Product<select aria-label="Product" value={def.product || ""} onChange={(e) => set({ product: e.target.value || undefined })}><option value="">Any product</option>{m.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Event<select aria-label="Event" value={def.event || ""} onChange={(e) => set({ event: e.target.value || undefined })}><option value="">Any event</option>{m.events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
      <div className="rb-chart"><span className="lbl">Chart</span><div className="seg" role="group" aria-label="Chart">{(["bar", "line", "donut", "table"] as Chart[]).map((c) => <button key={c} type="button" aria-pressed={def.chart === c} onClick={() => set({ chart: c })}>{c === "bar" ? "Bars" : c === "line" ? "Line" : c === "donut" ? "Donut" : "Table"}</button>)}</div></div>
    </div>
    <div className="rb-out"><div className="rb-head"><div><b>{result.title}</b><span className="small muted"> · {result.periodLabel}</span></div><b className="num rb-total">{fmt(result, result.total)}</b></div>
      <ReportChart r={result} chart={def.chart} /></div>
    <div className="rb-save"><input type="text" placeholder={`Name, e.g. ${result.title}`} value={name} onChange={(e) => setName(e.target.value)} aria-label="Report name" />
      <label className="inline"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />Share with the team</label>
      <button className="btn primary" onClick={save}>{edit ? "Save changes" : "Save report"}</button></div>
  </section>;
}

function Schedule({ r, onDone }: { r: Saved; onDone: () => void }) {
  const { run } = useData();
  const [f, setF] = useState({ freq: r.schedule?.freq || "weekly", weekday: r.schedule?.weekday ?? 1, to: (r.schedule?.recipients || []).join(", "), drive: !!r.schedule?.toDrive });
  const save = async (off = false) => { const recipients = f.to.split(/[,;\s]+/).filter(Boolean);
    if (await run(() => api(`/api/reports/${r.id}`, { method: "PATCH", json: { schedule: off ? null : { freq: f.freq, weekday: f.weekday, recipients, toDrive: f.drive } } }), off ? "Schedule turned off" : "Schedule saved")) onDone(); };
  return <div className="rep-sched">
    <div className="seg" role="group" aria-label="How often"><button type="button" aria-pressed={f.freq === "weekly"} onClick={() => setF({ ...f, freq: "weekly" })}>Weekly</button><button type="button" aria-pressed={f.freq === "monthly"} onClick={() => setF({ ...f, freq: "monthly" })}>Monthly (on the 1st)</button></div>
    {f.freq === "weekly" && <select aria-label="Day" value={f.weekday} onChange={(e) => setF({ ...f, weekday: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i}>Every {d}</option>)}</select>}
    <input type="text" placeholder="Who receives it: emails, separated by commas" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label="Recipients" />
    <label className="inline"><input type="checkbox" checked={f.drive} onChange={(e) => setF({ ...f, drive: e.target.checked })} />Also save it to my Google Drive as a spreadsheet</label>
    <div className="inline" style={{ gap: 8 }}><button className="btn primary sm" disabled={!f.to.trim()} onClick={() => save()}>Save schedule</button>{r.schedule && <button className="btn sm ghost" onClick={() => save(true)}>Turn off</button>}</div>
  </div>;
}

function SavedList({ list, onEdit, reload }: { list: Saved[]; onEdit: (r: Saved) => void; reload: () => void }) {
  const { m, run } = useData();
  const [sched, setSched] = useState<string | null>(null);
  if (!list.length) return <p className="empty">Saved reports appear here. Build one above and click Save report.</p>;
  return <div className="rep-saved">{list.map((r) => { const res = runReport(m, r.def, m.me.id); const mine = r.ownerId === m.me.id || m.me.role === "admin";
    return <section key={r.id} className="panel rep-card">
      <div className="rc-head"><div><b>{r.name}</b><div className="small muted">{res.title} · {res.periodLabel}{r.shared ? " · shared with the team" : ""}{r.ownerId !== m.me.id ? ` · by ${m.users.find((u) => u.id === r.ownerId)?.name || "a teammate"}` : ""}</div>
        {r.schedule && <div className="small rc-sched">✉ {r.schedule.freq === "weekly" ? `Every ${DAYS[r.schedule.weekday ?? 1]}` : "Monthly"} to {r.schedule.recipients.join(", ")}{r.schedule.toDrive ? " · saved to Drive" : ""}{r.lastSentAt ? ` · last sent ${new Date(r.lastSentAt).toLocaleDateString()}` : ""}</div>}</div>
        <b className="num rb-total">{fmt(res, res.total)}</b></div>
      <ReportChart r={res} chart={r.def.chart} />
      {mine && <div className="rc-act"><button className="linkbtn small" onClick={() => onEdit(r)}>Edit</button><button className="linkbtn small" onClick={() => setSched(sched === r.id ? null : r.id)}>{r.schedule ? "Change schedule" : "Schedule"}</button>
        {r.schedule && <button className="linkbtn small" onClick={() => run(() => api(`/api/reports/${r.id}/send`, { json: {} }), "Report sent")}>Send now</button>}
        <button className="linkbtn small" onClick={() => run(() => api(`/api/reports/${r.id}`, { method: "PATCH", json: { shared: !r.shared } }), r.shared ? "No longer shared" : "Shared with the team").then(reload)}>{r.shared ? "Stop sharing" : "Share with team"}</button>
        <button className="linkbtn small" style={{ color: "var(--muted)" }} onClick={() => { if (confirm(`Delete "${r.name}"?`)) run(() => api(`/api/reports/${r.id}`, { method: "DELETE" }), "Report deleted").then(reload); }}>Delete</button></div>}
      {sched === r.id && <Schedule r={r} onDone={() => { setSched(null); reload(); }} />}
    </section>; })}</div>;
}

function Dashboards({ reports }: { reports: Saved[] }) {
  const { run, toast } = useData();
  const { data, mutate } = useSWR<{ dashboards: Dash[] }>("/api/dashboards", (u: string) => api<{ dashboards: Dash[] }>(u));
  const [name, setName] = useState(""); const [pick, setPick] = useState<string[]>([]);
  const create = async () => { if (await run(() => api("/api/dashboards", { json: { name: name.trim() || "Leadership dashboard", reportIds: pick } }), "Dashboard created")) { setName(""); setPick([]); mutate(); } };
  const copy = (u: string) => navigator.clipboard?.writeText(u).then(() => toast("Link copied"), () => undefined);
  return <div className="dash-wrap">
    <section className="panel"><div className="sec-h"><h3>New dashboard</h3><span className="small muted">Anyone with its private link can view it, without signing in. It always shows live numbers, using what you can see.</span></div>
      {reports.length ? <><div className="chips" style={{ marginTop: 0 }}>{reports.map((r) => <button key={r.id} type="button" className="chip" aria-pressed={pick.includes(r.id)} onClick={() => setPick(pick.includes(r.id) ? pick.filter((x) => x !== r.id) : [...pick, r.id])}>{r.name}</button>)}</div>
        <div className="inline" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}><input type="text" placeholder="Dashboard name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: "1 1 220px" }} aria-label="Dashboard name" />
          <button className="btn primary" disabled={!pick.length} onClick={create}>Create dashboard with {pick.length} report{pick.length === 1 ? "" : "s"}</button></div></>
        : <p className="empty" style={{ margin: 0 }}>Save a report first, then choose which ones go on a dashboard.</p>}</section>
    {(data?.dashboards || []).map((d) => <section key={d.id} className="panel dash-card"><div className="rc-head"><div><b>{d.name}</b><div className="small muted">{d.reportIds.length} report{d.reportIds.length === 1 ? "" : "s"} · link {d.linkOn ? "on" : "off"}</div></div></div>
      <div className="dash-link"><input type="text" readOnly value={d.url} aria-label="Dashboard link" onFocus={(e) => e.target.select()} /><button className="btn sm" disabled={!d.linkOn} onClick={() => copy(d.url)}>Copy link</button>
        {d.linkOn && <a className="btn sm ghost" href={d.url} target="_blank" rel="noopener">Open</a>}</div>
      <div className="rc-act"><button className="linkbtn small" onClick={() => run(() => api(`/api/dashboards/${d.id}`, { method: "PATCH", json: { linkOn: !d.linkOn } }), d.linkOn ? "Link switched off" : "Link switched on").then(() => mutate())}>{d.linkOn ? "Switch link off" : "Switch link on"}</button>
        <button className="linkbtn small" onClick={() => { if (confirm("Make a new link? The current link will stop working.")) run(() => api(`/api/dashboards/${d.id}`, { method: "PATCH", json: { newLink: true } }), "New link made").then(() => mutate()); }}>Make a new link</button>
        <button className="linkbtn small" style={{ color: "var(--muted)" }} onClick={() => { if (confirm(`Delete "${d.name}"?`)) run(() => api(`/api/dashboards/${d.id}`, { method: "DELETE" }), "Dashboard deleted").then(() => mutate()); }}>Delete</button></div>
    </section>)}
  </div>;
}

/** The Report builder and Dashboards tabs. */
export function CustomReports({ tab }: { tab: "builder" | "dashboards" }) {
  const { data, mutate } = useSWR<{ reports: Saved[] }>("/api/reports", (u: string) => api<{ reports: Saved[] }>(u));
  const [edit, setEdit] = useState<Saved | null>(null);
  const list = data?.reports || [];
  if (tab === "dashboards") return <Dashboards reports={list} />;
  return <div className="dir"><Builder edit={edit} onSaved={() => { setEdit(null); mutate(); }} />
    {edit && <button className="linkbtn" onClick={() => setEdit(null)}>Cancel editing and start a new report</button>}
    <h3 className="section-h" style={{ margin: "6px 0 0" }}>Saved reports</h3>
    <SavedList list={list} onEdit={(r) => { setEdit(r); window.scrollTo({ top: 0, behavior: "smooth" }); }} reload={() => mutate()} /></div>;
}

/** A shared dashboard, for anyone with the link. */
export function PublicDashboard({ token }: { token: string }) {
  const [d, setD] = useState<{ name: string; owner: string; generatedAt: number; reports: { id: string; name: string; def: ReportDef; result: ReportResult }[] } | null>(null); const [err, setErr] = useState("");
  useEffect(() => { fetch(`/api/public/dashboard/${token}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Not available"); setD(j); }).catch((e) => setErr(e.message)); }, [token]);
  return <main className="pub-dash"><header><img src="/api/public/brand/logo" alt="Logo" className="logo" /><div><h1>{d?.name || "Dashboard"}</h1>{d && <p className="muted">Live numbers · updated {new Date(d.generatedAt).toLocaleString()} · shared by {d.owner}</p>}</div></header>
    {err ? <p className="empty">This dashboard link isn't available. It may have been switched off.</p> : !d ? <p className="muted">Loading…</p>
      : <div className="pub-grid">{d.reports.map((r) => <section key={r.id} className="panel rep-card"><div className="rc-head"><div><b>{r.name}</b><div className="small muted">{r.result.title} · {r.result.periodLabel}</div></div><b className="num rb-total">{fmt(r.result, r.result.total)}</b></div><ReportChart r={r.result} chart={r.def.chart} /></section>)}</div>}
  </main>;
}
