"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import type { AuditDTO, Role } from "@/lib/types";
import { api, useData } from "../data";
import { Avatar, Panel } from "../ui";
import { ago, DAY, ROLE_CAN, ROLE_LABEL, userName } from "../model";

const ROLES: Role[] = ["admin", "manager", "rep", "viewer"];
type InviteResult = { email: string; status: string; emailed: boolean; link?: string; error?: string };

export function TeamView() {
  const { m, run, perms, toast } = useData();
  const [emails, setEmails] = useState(() => (typeof window !== "undefined" ? new URLSearchParams(location.search).get("invite") || "" : ""));
  const [role, setRole] = useState<Role>("rep");
  const [inviteTeams, setInviteTeams] = useState<string[]>([]);
  const [editTeams, setEditTeams] = useState<string | null>(null);
  const teamsOf = (uid: string) => m.teams.filter((t) => t.memberIds.includes(uid) || t.leadId === uid);
  const toggle = (l: string[], v: string) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);
  const [results, setResults] = useState<InviteResult[] | null>(null);
  const [showDisabled, setShowDisabled] = useState(false);
  const wk = Date.now() - 7 * DAY;
  const users = m.users.filter((u) => showDisabled || u.status === "active")
    .map((u) => ({ u, owns: m.contacts.filter((c) => c.ownerId === u.id).length, wk: m.activities.filter((a) => a.byId === u.id && a.at >= wk).length }))
    .sort((a, b) => (a.u.status === b.u.status ? b.wk - a.wk : a.u.status === "active" ? -1 : 1));
  async function invite() {
    const list = emails.split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
    if (!list.length) { toast("Enter at least one email address.", "error"); return; }
    const r = await run(() => api<{ results: InviteResult[] }>("/api/invites", { json: { emails: list, role, teamIds: inviteTeams } }));
    if (r) { setResults(r.results); setEmails(""); toast(`${r.results.filter((x) => x.status === "invited").length} invited`); }
  }
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); toast("Link copied"); } catch { toast("Copy failed. Select the link and copy it by hand.", "error"); } };
  const invs = m.invites;
  return <div className="grid">
    <Panel className="s8" title="Team members" sub="Everyone who can sign in. Roles take effect on their next click."
      action={perms.admin ? <label className="small muted" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={showDisabled} onChange={(e) => setShowDisabled(e.target.checked)} />Show disabled</label> : undefined}>
      <table className="tbl"><thead><tr><th>Person</th><th>Role</th><th>Teams</th><th className="n">Leads owned</th><th className="n">Activity 7 days</th><th>Last sign-in</th>{perms.admin && <th />}</tr></thead>
        <tbody>{users.map(({ u, owns, wk }) => <tr key={u.id} style={u.status === "disabled" ? { opacity: 0.55 } : undefined}>
          <td><div className="who-cell"><Avatar name={u.name || u.email} image={u.image} size={26} /><div><div>{u.id === m.me.id ? `${u.name || u.email} (you)` : u.name || u.email}</div><div className="small muted">{u.email}</div></div></div></td>
          <td>{perms.admin && u.id !== m.me.id ? <select style={{ width: "auto" }} aria-label={`Role for ${u.email}`} value={u.role}
            onChange={(e) => run(() => api(`/api/users/${u.id}`, { method: "PATCH", json: { role: e.target.value } }), "Role updated")}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
            : <span className="role">{ROLE_LABEL[u.role]}</span>}</td>
          <td>{editTeams === u.id ? <div className="chips" style={{ marginTop: 0 }}>{m.teams.map((t) => { const on = teamsOf(u.id).some((x) => x.id === t.id);
              return <button key={t.id} type="button" className="chip" aria-pressed={on} onClick={() => run(() => api(`/api/users/${u.id}`, { method: "PATCH", json: { teamIds: toggle(teamsOf(u.id).map((x) => x.id), t.id) } }), on ? `Removed from ${t.name}` : `Added to ${t.name}`)}>{t.name}</button>; })}
              <button type="button" className="linkbtn small" onClick={() => setEditTeams(null)}>Done</button></div>
            : <span className="small">{teamsOf(u.id).map((t) => t.name).join(", ") || <span className="muted">No team</span>}{perms.admin && m.teams.length > 0 && <> <button type="button" className="linkbtn small" onClick={() => setEditTeams(u.id)}>Change</button></>}</span>}</td>
          <td className="n">{owns}</td><td className="n">{wk}</td><td className="small muted">{ago(u.lastLoginAt)}</td>
          {perms.admin && <td className="n"><div className="row-acts">{u.id !== m.me.id && m.config.passwordAuth && u.status === "active" && <button className="linkbtn" title="A one-time link for them to set a new password"
            onClick={async () => { const r = await run(() => api<{ link: string }>(`/api/users/${u.id}/password-link`, { json: {} })); if (r) { try { await navigator.clipboard.writeText(r.link); toast(`Password link for ${u.email} copied. Send it to them; it works once, for 24 hours.`); } catch { prompt("Copy this link and send it to them (works once, for 24 hours):", r.link); } } }}>Password link</button>}
            {u.id !== m.me.id && <button className="linkbtn" style={u.status === "active" ? { color: "var(--cold)" } : undefined}
            onClick={() => { const dis = u.status === "active"; if (dis && !confirm(`Disable ${u.email}? They are signed out on their next request.`)) return;
              run(() => api(`/api/users/${u.id}`, { method: "PATCH", json: { status: dis ? "disabled" : "active" } }), dis ? "Access disabled" : "Access restored"); }}>{u.status === "active" ? "Disable" : "Restore"}</button>}</div></td>}
        </tr>)}</tbody></table>
    </Panel>
    {perms.admin ? <Panel className="s4" title="Invite teammates" sub={m.config.mail ? "They get an email with a link. They join with the role you pick when they sign in." : "Email is not configured, so copy each invite link and send it yourself."}>
      <div className="form">
        <label>Email addresses<input type="text" placeholder="Emails, separated by commas" value={emails} onChange={(e) => setEmails(e.target.value)} /></label>
        <label>Role<select value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
        <p className="small muted" style={{ margin: 0 }}>{ROLE_CAN[role][0]}.</p>
        {m.teams.length > 0 && <label>Teams{role === "admin" ? " (admins see everything anyway)" : ""}<div className="chips" style={{ marginTop: 0 }}>{m.teams.map((t) => <button key={t.id} type="button" className="chip" aria-pressed={inviteTeams.includes(t.id)} onClick={() => setInviteTeams(toggle(inviteTeams, t.id))}>{t.name}</button>)}</div></label>}
        <div className="btns"><button className="btn primary" onClick={invite}>Send invite</button></div>
        {results && <ul className="feed">{results.map((r) => <li key={r.email}><b>{r.email}</b> <span className="muted small">{r.status === "already-member" ? "is already a member" : r.emailed ? "invite emailed" : r.error || "invite created"}</span>
          {r.link && !r.emailed && <div><button className="linkbtn" onClick={() => copy(r.link!)}>Copy invite link</button></div>}</li>)}</ul>}
      </div>
    </Panel> : <Panel className="s4" title="Invite teammates"><p className="muted small" style={{ margin: 0 }}>Only admins can invite people and change roles. Ask an admin to add your colleague.</p></Panel>}
    {perms.admin && <Panel className="s8" title="Pending invites" action={<span className="num muted">{invs.length}</span>}>
      {invs.length ? <table className="tbl"><thead><tr><th>Email</th><th>Role</th><th>Teams</th><th>Invited</th><th /></tr></thead>
        <tbody>{invs.map((i) => <tr key={i.id}><td>{i.email}</td><td><span className="small">{ROLE_LABEL[i.role]}</span></td>
          <td className="small">{i.teamIds.map((id) => m.teamMap.get(id)?.name).filter(Boolean).join(", ") || <span className="muted">None</span>}</td><td className="small muted">{i.invitedById ? userName(m, i.invitedById) + ", " : ""}{ago(i.lastSentAt || i.createdAt)}</td>
          <td className="n"><button className="linkbtn" onClick={() => copy(i.link)}>Copy link</button>
            {m.config.mail && <button className="linkbtn" style={{ marginLeft: 12 }} onClick={() => run(() => api(`/api/invites/${i.id}/resend`, { json: {} }), "Invite resent")}>Resend</button>}
            <button className="linkbtn" style={{ marginLeft: 12, color: "var(--cold)" }} onClick={() => { if (confirm(`Cancel the invite for ${i.email}?`)) run(() => api(`/api/invites/${i.id}`, { method: "DELETE" }), "Invite cancelled"); }}>Cancel</button></td></tr>)}</tbody></table>
        : <p className="empty">No pending invites.</p>}
    </Panel>}
    {perms.admin && <AuditPanel />}
    <Panel className="s12" title="Roles: who sees what" sub="Enforced by the server on every request, not just hidden on screen. Managers see their teams, so put people in teams to give their manager visibility.">
      <div className="rolecards">{ROLES.map((r) => <div key={r} className="rolecard"><h3>{ROLE_LABEL[r]}{r === m.me.role && <span className="role">You</span>}</h3><ul>{ROLE_CAN[r].map((x) => <li key={x}>{x}</li>)}</ul></div>)}</div>
    </Panel>
  </div>;
}

function AuditPanel({ wide = false }: { wide?: boolean }) {
  const { m } = useData();
  const { data } = useSWR<AuditDTO[]>("/api/audit", (u: string) => api<AuditDTO[]>(u), { refreshInterval: 60000 });
  const [n, setN] = useState(10);
  useEffect(() => setN(10), []);
  return <Panel className={wide ? "s12" : "s4"} title="Audit log" sub="Role changes, deletes, merges and exports.">
    {data?.length ? <><ul className="feed">{data.slice(0, n).map((a) => <li key={a.id}><b>{a.actorId ? userName(m, a.actorId) : "System"}</b> <span className="muted small">{a.action.replace(".", " ")}{a.detail && typeof a.detail.email === "string" ? ` · ${a.detail.email}` : ""}{a.detail && typeof a.detail.name === "string" ? ` · ${a.detail.name}` : ""} · {ago(a.at)}</span></li>)}</ul>
      {data.length > n && <button className="linkbtn" onClick={() => setN(n + 20)}>Show more</button>}</> : <p className="empty">Nothing yet.</p>}
  </Panel>;
}
