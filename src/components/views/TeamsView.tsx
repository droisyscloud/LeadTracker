"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { TeamDTO } from "@/lib/types";
import { api, Modal, useData } from "../data";
import { Avatar, ContactRow, Panel } from "../ui";
import { DealList } from "../widgets";
import { AISummary } from "../AISummary";
import { coName, DAY, isOpenDeal, money, moneyShort, scopeModel, teamMetrics, userName, dv } from "../model";

const COLORS = ["#4C8DF0", "#38D6E8", "#9B8CFF", "#3DDC97", "#F2B84B", "#FF7A59", "#E879F9", "#94A3B8"];

function TeamDialog({ team, onClose }: { team?: TeamDTO; onClose: () => void }) {
  const { m, run } = useData(); const router = useRouter();
  const [f, setF] = useState({ name: team?.name || "", description: team?.description || "", color: team?.color || COLORS[m.teams.length % COLORS.length], leadId: team?.leadId || "", target: String(team?.target || "") });
  const [members, setMembers] = useState<string[]>(team?.memberIds || []); const [prods, setProds] = useState<string[]>(team?.productIds || []);
  const toggle = (l: string[], set: (x: string[]) => void, id: string) => set(l.includes(id) ? l.filter((x) => x !== id) : [...l, id]);
  const save = async (e: React.FormEvent) => { e.preventDefault();
    const json = { name: f.name.trim(), description: f.description, color: f.color, leadId: f.leadId || null, target: Math.round(Number(f.target.replace(/\D/g, "")) || 0),
      memberIds: f.leadId && !members.includes(f.leadId) ? [...members, f.leadId] : members, productIds: prods };
    const r = team ? await run(() => api(`/api/teams/${team.id}`, { method: "PATCH", json }), "Team saved") : await run(() => api<{ id: string }>("/api/teams", { json }), "Team created");
    if (r) { onClose(); if (!team) router.push(`/teams?id=${(r as { id: string }).id}`); } };
  const people = m.users.filter((u) => u.status === "active");
  return <Modal open onClose={onClose} label="Team"><form className="dlg form" onSubmit={save}>
    <header><h2>{team ? "Edit team" : "New team"}</h2><button type="button" className="btn ghost" onClick={onClose}>Close</button></header>
    <div className="two"><label>Team name<input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required autoFocus placeholder="East region" /></label>
      <label>Team lead<select value={f.leadId} onChange={(e) => setF({ ...f, leadId: e.target.value })}><option value="">None</option>{people.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}</select></label></div>
    <label>What this team covers<input type="text" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Slot route operators in the US Midwest" /></label>
    <div className="two"><label>Revenue target (USD)<input type="text" inputMode="numeric" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} placeholder="500000" /></label>
      <label>Colour<div className="chips" style={{ marginTop: 0 }}>{COLORS.map((c) => <button key={c} type="button" aria-label={c} aria-pressed={f.color === c} className="chip" onClick={() => setF({ ...f, color: c })} style={{ width: 30, height: 30, padding: 0, background: c, borderColor: f.color === c ? "var(--ink)" : "transparent" }} />)}</div></label></div>
    <label>Members<div className="chips" style={{ marginTop: 0 }}>{people.map((u) => <button key={u.id} type="button" className="chip" aria-pressed={members.includes(u.id) || f.leadId === u.id} onClick={() => toggle(members, setMembers, u.id)}>{u.name || u.email}</button>)}</div></label>
    <label>Products this team sells<div className="chips" style={{ marginTop: 0 }}>{m.products.map((p) => <button key={p.id} type="button" className="chip" aria-pressed={prods.includes(p.id)} onClick={() => toggle(prods, setProds, p.id)}>{p.name}</button>)}</div></label>
    <div className="btns"><button className="btn primary">{team ? "Save team" : "Create team"}</button>
      {team && <button type="button" className="btn danger" onClick={async () => { if (confirm(`Delete ${team.name}? Its leads and deals stay, without a team.`) && await run(() => api(`/api/teams/${team.id}`, { method: "DELETE" }), "Team deleted")) { onClose(); router.push("/teams"); } }}>Delete team</button>}</div>
  </form></Modal>;
}

function AssignDialog({ team, onClose }: { team: TeamDTO; onClose: () => void }) {
  const { m, run } = useData(); const [q, setQ] = useState(""); const [pick, setPick] = useState<string[]>([]); const [byProduct, setByProduct] = useState("");
  const list = m.contacts.filter((c) => c.teamId !== team.id && (!q || [c.name, coName(m, c), c.email].join(" ").toLowerCase().includes(q.toLowerCase())) && (!byProduct || c.productIds.includes(byProduct)));
  return <Modal open onClose={onClose} label="Add leads to team"><div className="dlg form">
    <header><h2>Add leads to {team.name}</h2><button className="btn ghost" onClick={onClose}>Close</button></header>
    <div className="inline"><input type="search" placeholder="Search leads or companies" value={q} onChange={(e) => setQ(e.target.value)} />
      <select style={{ width: "auto", flex: "0 0 auto" }} value={byProduct} onChange={(e) => setByProduct(e.target.value)}><option value="">Any product</option>{m.products.map((p) => <option key={p.id} value={p.id}>Interested in {p.name}</option>)}</select></div>
    <div className="inline" style={{ justifyContent: "space-between" }}><span className="small muted">{pick.length} selected of {list.length}</span>
      <button className="linkbtn" onClick={() => setPick(pick.length === list.length ? [] : list.map((c) => c.id))}>{pick.length === list.length && list.length ? "Clear" : "Select all shown"}</button></div>
    <div className="scanlist">{list.map((c) => <label key={c.id} className="scanitem" style={{ alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={pick.includes(c.id)} onChange={() => setPick(pick.includes(c.id) ? pick.filter((x) => x !== c.id) : [...pick, c.id])} />
      <span><b>{c.name}</b> <span className="small muted">{[c.title, coName(m, c)].filter(Boolean).join(", ")}{c.teamId ? ` · now in ${m.teamMap.get(c.teamId)?.name}` : ""}</span></span></label>)}
      {!list.length && <p className="empty">No leads match.</p>}</div>
    <div className="btns"><button className="btn primary" disabled={!pick.length} onClick={async () => { if (await run(() => api(`/api/teams/${team.id}/assign`, { json: { contactIds: pick } }), `${pick.length} leads added to ${team.name}`)) onClose(); }}>Add {pick.length || ""} to team</button></div>
  </div></Modal>;
}

export function TeamsView() {
  const { m, perms, run } = useData(); const sp = useSearchParams(); const router = useRouter();
  const sel = sp.get("id") ? m.teamMap.get(sp.get("id")!) : undefined;
  const [edit, setEdit] = useState<TeamDTO | "new" | null>(null); const [assign, setAssign] = useState(false);
  const notAllowed = !perms.manage;
  const rows = useMemo(() => m.teams.map((t) => ({ t, k: teamMetrics(m, t.id) })).sort((a, b) => b.k.won + b.k.openPipe - (a.k.won + a.k.openPipe)), [m]);
  const unassigned = m.contacts.filter((c) => !c.teamId).length;
  const canEdit = (t: TeamDTO) => perms.manage || t.leadId === m.me.id;
  if (notAllowed) return <div className="grid"><Panel className="s12" title="Teams"><p className="empty">Team pages are for managers and admins. Your own leads, tasks and results are on Home, Contacts and Tasks.</p></Panel></div>;
  if (sel) {
    const k = teamMetrics(m, sel.id); const s = scopeModel(m, sel.id); const wk = Date.now() - 7 * DAY;
    const people = sel.memberIds.map((id) => { const a = m.activities.filter((x) => x.byId === id && s.contactMap.has(x.contactId));
      const ds = s.deals.filter((d) => d.ownerId === id);
      return { id, emails: a.filter((x) => x.type === "email").length, calls: a.filter((x) => x.type === "call").length, meetings: a.filter((x) => x.type === "meeting").length, wk: a.filter((x) => x.at >= wk).length,
        owned: s.contacts.filter((c) => c.ownerId === id).length, pipe: ds.filter(isOpenDeal).reduce((n, d) => n + dv(d), 0), won: ds.filter((d) => d.stage === "won").reduce((n, d) => n + dv(d), 0) }; })
      .sort((a, b) => b.won - a.won || b.wk - a.wk);
    const pct = sel.target ? Math.min(100, Math.round((k.won / sel.target) * 100)) : 0;
    const K = ({ l, v, sub }: { l: string; v: string | number; sub?: string }) => <div className="panel kpi" style={{ ["--k" as string]: sel.color }}><div className="lab">{l}</div><span className="val">{v}</span>{sub && <div className="sub">{sub}</div>}</div>;
    return <div className="grid">
      <div className="s12 inline" style={{ justifyContent: "space-between" }}>
        <div className="inline"><button className="btn ghost" onClick={() => router.push("/teams")}>All teams</button><i className="dot" style={{ background: sel.color, width: 14, height: 14 }} /><h2 style={{ fontSize: "1.4rem" }}>{sel.name}</h2>
          {sel.leadId && <span className="muted small">Lead: {userName(m, sel.leadId)}</span>}</div>
        <div className="inline"><Link className="btn" href={`/home?team=${sel.id}`}>Open team dashboard</Link>{canEdit(sel) && <><button className="btn" onClick={() => setAssign(true)}>Add leads</button><button className="btn primary" onClick={() => setEdit(sel)}>Edit team</button></>}</div>
      </div>
      {sel.description && <p className="s12 muted" style={{ margin: 0 }}>{sel.description}</p>}
      <AISummary key={sel.id} scope="team" id={sel.id} className="s12" />
      <div className="kpis">
        <K l="Leads" v={k.leads} sub={`${k.untouched} not contacted yet`} /><K l="Contacted" v={`${k.leads ? Math.round((k.contacted / k.leads) * 100) : 0}%`} sub={`${k.contacted} of ${k.leads}`} />
        <K l="Reply rate" v={`${k.replyRate}%`} sub={`${k.emails} emails, ${k.replies} replies`} /><K l="Calls" v={k.calls} sub={`${k.connected} connected`} />
        <K l="Open pipeline" v={moneyShort(k.openPipe)} sub={`${moneyShort(k.weighted)} weighted`} /><K l="Won" v={moneyShort(k.won)} sub={sel.target ? `${pct}% of ${moneyShort(sel.target)} target` : `win rate ${k.winRate}%`} />
      </div>
      {sel.target > 0 && <div className="s12 panel" style={{ padding: 14 }}><div className="inline" style={{ justifyContent: "space-between" }}><b>Progress to target</b><span className="num">{money(k.won)} of {money(sel.target)}</span></div>
        <div className="steps"><span className="trk" style={{ display: "block", height: 10, marginTop: 8 }}><i style={{ width: pct + "%", background: sel.color }} /></span></div></div>}
      <Panel className="s7" title="Member performance" sub="Activity on this team's leads. 7 days column is the last week.">
        {people.length ? <div style={{ overflowX: "auto" }}><table className="tbl"><thead><tr><th>Person</th><th className="n">Leads</th><th className="n">Emails</th><th className="n">Calls</th><th className="n">Meetings</th><th className="n">7 days</th><th className="n">Pipeline</th><th className="n">Won</th></tr></thead>
          <tbody>{people.map((p) => { const u = m.userMap.get(p.id); return <tr key={p.id}><td><div className="who-cell"><Avatar name={u?.name || u?.email || "?"} image={u?.image} size={24} />{userName(m, p.id)}{p.id === sel.leadId && <span className="role">Lead</span>}</div></td>
            <td className="n">{p.owned}</td><td className="n">{p.emails}</td><td className="n">{p.calls}</td><td className="n">{p.meetings}</td><td className="n">{p.wk}</td><td className="n">{money(p.pipe)}</td><td className="n">{money(p.won)}</td></tr>; })}</tbody></table></div>
          : <p className="empty">No members yet.</p>}
      </Panel>
      <Panel className="s5" title="Products" sub="What this team sells, and interest among its leads.">
        {(sel.productIds.length ? sel.productIds : m.products.map((p) => p.id)).map((pid) => { const p = m.productMap.get(pid); if (!p) return null; const n = s.contacts.filter((c) => c.productIds.includes(pid)).length;
          return <div key={pid} className="bars" style={{ marginBottom: 10 }}><span className="lbl"><span>{p.name}</span><span className="num muted">{n} leads</span></span><span className="trk"><i style={{ width: `${s.contacts.length ? (n / s.contacts.length) * 100 : 0}%` }} /></span></div>; })}
        {!sel.productIds.length && <p className="small muted" style={{ margin: 0 }}>No products set for this team, so all products are shown.</p>}
      </Panel>
      <Panel className="s6" title={`Open deals (${s.deals.filter(isOpenDeal).length})`}><DealList deals={s.deals.filter(isOpenDeal).sort((a, b) => b.value - a.value)} /></Panel>
      <Panel className="s6" title={`Leads (${s.contacts.length})`} action={canEdit(sel) && <button className="linkbtn" onClick={() => setAssign(true)}>+ Add leads</button>}>
        {s.contacts.length ? <ul className="rows" style={{ maxHeight: 520, overflow: "auto" }}>{s.contacts.map((c) => <li key={c.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center" }}>
          <ul className="rows"><ContactRow m={m} c={c} /></ul>{canEdit(sel) && <button className="linkbtn" style={{ color: "var(--muted)", marginLeft: 8 }} onClick={() => run(() => api(`/api/teams/${sel.id}/assign`, { json: { contactIds: [c.id], remove: true } }), "Removed from team")}>Remove</button>}</li>)}</ul>
          : <p className="empty">No leads in this team yet.</p>}
      </Panel>
      {edit && <TeamDialog team={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} />}
      {assign && <AssignDialog team={sel} onClose={() => setAssign(false)} />}
    </div>;
  }
  return <div className="grid">
    <div className="s12 inline" style={{ justifyContent: "space-between" }}>
      <span className="muted small">{m.teams.length} teams · {unassigned} leads without a team</span>
      {perms.manage && <button className="btn primary" onClick={() => setEdit("new")}>+ New team</button>}
    </div>
    {rows.map(({ t, k }) => <Link key={t.id} href={`/teams?id=${t.id}`} className="panel s4" style={{ textDecoration: "none", color: "inherit", borderTop: `3px solid ${t.color}` }}>
      <div className="inline" style={{ justifyContent: "space-between" }}><h2>{t.name}</h2><span className="small muted">{t.memberIds.length} members</span></div>
      <p className="small muted" style={{ margin: "4px 0 12px", minHeight: 18 }}>{t.description || (t.leadId ? `Lead: ${userName(m, t.leadId)}` : "")}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
        {[["Leads", k.leads], ["Reply rate", `${k.replyRate}%`], ["Activity 7d", k.acts7], ["Pipeline", moneyShort(k.openPipe)], ["Won", moneyShort(k.won)], ["Win rate", `${k.winRate}%`]].map(([l, v]) =>
          <div key={String(l)}><div className="num" style={{ fontSize: "1.25rem", fontWeight: 600 }}>{v}</div><div className="small muted">{l}</div></div>)}
      </div>
      {t.target > 0 && <div style={{ marginTop: 12 }}><div className="small muted">{Math.round((k.won / t.target) * 100)}% of {moneyShort(t.target)} target</div>
        <span className="trk" style={{ display: "block", height: 6, background: "var(--chip)", borderRadius: 3, overflow: "hidden", marginTop: 4 }}><i style={{ display: "block", height: "100%", width: `${Math.min(100, (k.won / t.target) * 100)}%`, background: t.color }} /></span></div>}
    </Link>)}
    {!m.teams.length && <Panel className="s12" title="No teams yet"><p className="empty">Create teams such as "East region" or "Enterprise accounts", add people and products, then move leads into them to compare performance.</p></Panel>}
    {m.teams.length > 1 && <Panel className="s12" title="Teams compared">
      <div style={{ overflowX: "auto" }}><table className="tbl"><thead><tr><th>Team</th><th className="n">Members</th><th className="n">Leads</th><th className="n">Contacted</th><th className="n">Emails</th><th className="n">Reply rate</th><th className="n">Calls</th><th className="n">Meetings</th><th className="n">Overdue tasks</th><th className="n">Open pipeline</th><th className="n">Weighted</th><th className="n">Won</th><th className="n">Win rate</th><th className="n">Target</th></tr></thead>
        <tbody>{rows.map(({ t, k }) => <tr key={t.id}><td><Link className="colink" href={`/teams?id=${t.id}`}><i className="dot" style={{ background: t.color, marginRight: 6 }} />{t.name}</Link></td><td className="n">{t.memberIds.length}</td><td className="n">{k.leads}</td>
          <td className="n">{k.leads ? Math.round((k.contacted / k.leads) * 100) : 0}%</td><td className="n">{k.emails}</td><td className="n">{k.replyRate}%</td><td className="n">{k.calls}</td><td className="n">{k.meetings}</td><td className="n">{k.overdueTasks}</td>
          <td className="n">{money(k.openPipe)}</td><td className="n">{money(k.weighted)}</td><td className="n">{money(k.won)}</td><td className="n">{k.winRate}%</td><td className="n">{t.target ? `${Math.round((k.won / t.target) * 100)}%` : "–"}</td></tr>)}</tbody></table></div>
    </Panel>}
    {edit && <TeamDialog team={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} />}
  </div>;
}
