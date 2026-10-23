"use client";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { api, useData } from "./data";

/* Settings: data clean-up (duplicates, missing websites, contacts at the wrong company, missing emails), sync health, meeting automation. */
const FREE = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "ymail.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "zoho.com"]);
const dom = (e: string) => (e.split("@")[1] || "").toLowerCase();
const site = (w: string) => (w || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
export function DataHealth() {
  const { m, run, perms } = useData(); const [open, setOpen] = useState<string | null>(null);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const acts = (id: string) => m.actsByContact.get(id)?.length || 0;
  const dups: (typeof m.contacts)[] = (() => { const g = new Map<string, typeof m.contacts>(); for (const c of m.contacts) { for (const k of [c.companyId ? `${c.companyId}|${norm(c.name)}` : "", ...[c.email, ...(c.otherEmails || [])].filter(Boolean).map((e) => `@${e.toLowerCase()}`)]) if (k) g.set(k, [...(g.get(k) || []), c]); }
    const seen = new Set<string>(); const out: (typeof m.contacts)[] = []; for (const l of g.values()) { const u = [...new Map(l.map((c) => [c.id, c])).values()]; if (u.length < 2) continue; const key = u.map((c) => c.id).sort().join(); if (!seen.has(key)) { seen.add(key); out.push(u); } } return out; })();
  const ownDom = dom(m.me.email);
  const noSite = m.companies.filter((co) => !site(co.website || "")).map((co) => { const ds = m.contacts.filter((c) => c.companyId === co.id && c.email).map((c) => dom(c.email)).filter((d) => d && !FREE.has(d) && d !== ownDom);
    const best = [...ds.reduce((mp, d) => mp.set(d, (mp.get(d) || 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0]?.[0]; return { co, best }; }).filter((x) => x.best);
  const byDom = new Map<string, string>(); for (const co of m.companies) { const s = site(co.website || ""); if (s) byDom.set(s, co.id); }
  const wrong = m.contacts.filter((c) => c.email && !FREE.has(dom(c.email))).map((c) => ({ c, should: byDom.get(dom(c.email)) })).filter((x) => x.should && x.should !== x.c.companyId);
  const noEmail = m.contacts.filter((c) => !c.email && !(c.otherEmails || []).length);
  const coName = (id: string | null | undefined) => m.companies.find((x) => x.id === id)?.name || "no company";
  const Sec = ({ k, title, n, children }: { k: string; title: string; n: number; children: React.ReactNode }) => <div className="dh-sec"><button type="button" className="dh-h" aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>
    <span className={"pill" + (n ? " fu-pr-pending" : "")}>{n}</span> {title} <span className="muted">{open === k ? "▾" : "▸"}</span></button>{open === k && <div className="dh-body">{n ? children : <p className="small muted">All good. 🎉</p>}</div>}</div>;
  return <section className="panel s12 dh"><h2>Data clean-up</h2><p className="small muted">Clean data means emails and meetings land on the right person, and new people at your companies can be found.</p>
    <Sec k="dups" title="Possible duplicate contacts" n={dups.length}><ul className="dh-list">{dups.slice(0, 40).map((g) => { const primary = g.reduce((x, y) => (acts(y.id) > acts(x.id) ? y : x));
      return <li key={g.map((c) => c.id).join()}><span>{g.map((c) => `${c.name}${c.email ? ` (${c.email})` : " (no email)"} · ${coName(c.companyId)} · ${acts(c.id)} activities`).join("  /  ")}</span>
        {perms.manage && <button type="button" className="btn sm" onClick={() => { if (confirm(`Merge into ${primary.name}? Everything moves to one record.`)) run(() => api("/api/contacts/merge", { json: { primaryId: primary.id, duplicateIds: g.filter((c) => c.id !== primary.id).map((c) => c.id) } }), "Merged"); }}>Merge</button>}</li>; })}</ul></Sec>
    <Sec k="site" title="Companies with no website (new people there can't be matched)" n={noSite.length}><ul className="dh-list">{noSite.slice(0, 60).map(({ co, best }) => <li key={co.id}><span><b>{co.name}</b> · their contacts use @{best}</span>
      {perms.write && <button type="button" className="btn sm" onClick={() => run(() => api(`/api/companies/${co.id}`, { method: "PATCH", json: { website: best } }), `Website set to ${best}`)}>Use {best}</button>}</li>)}</ul></Sec>
    <Sec k="wrong" title="Contacts filed under a different company than their email suggests" n={wrong.length}><ul className="dh-list">{wrong.slice(0, 60).map(({ c, should }) => <li key={c.id}><span><Link href={`/contacts?id=${c.id}`}>{c.name}</Link> ({c.email}) · under {coName(c.companyId)}, email matches <b>{coName(should)}</b></span>
      {perms.write && <button type="button" className="btn sm" onClick={() => run(() => api(`/api/contacts/${c.id}`, { method: "PATCH", json: { company: coName(should) } }), `Moved to ${coName(should)}`)}>Move to {coName(should)}</button>}</li>)}</ul></Sec>
    <Sec k="email" title="Contacts with no email (their emails can't be tracked)" n={noEmail.length}><ul className="dh-list">{noEmail.slice(0, 80).map((c) => <li key={c.id}><span><Link href={`/contacts?id=${c.id}`}>{c.name}</Link> · {coName(c.companyId)}</span></li>)}</ul></Sec>
  </section>;
}
type Row = { userId: string; name: string; email: string; provider: string; status: string; lastSyncAt: number | null; emails7d: number; meetings7d: number; warning: string | null };
export function SyncHealth() {
  const { perms, run } = useData(); const { data } = useSWR<{ rows: Row[]; notConnected: { id: string; name: string }[] }>(perms.manage ? "/api/admin/sync-health" : null, (u: string) => fetch(u).then((r) => r.json()));
  const auto = useSWR<{ enabled: boolean }>("/api/settings/meeting-automation", (u: string) => fetch(u).then((r) => r.json()));
  const ago = (t: number | null) => { if (!t) return "never"; const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
  return <section className="panel s12 sh"><h2>Mailbox and calendar sync</h2>
    {perms.manage && data && <><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Person</th><th>Mailbox</th><th>Last sync</th><th className="n">Emails (7 days)</th><th className="n">Meetings (7 days)</th><th>Status</th></tr></thead>
      <tbody>{data.rows.map((r) => <tr key={r.userId}><td><b>{r.name}</b></td><td className="small">{r.email}</td><td className="small">{ago(r.lastSyncAt)}</td><td className="n">{r.emails7d}</td><td className="n">{r.meetings7d}</td>
        <td>{r.warning ? <span className="small late-txt">⚠ {r.warning}</span> : <span className="small" style={{ color: "var(--k-call)" }}>✓ Working</span>}</td></tr>)}
        {!data.rows.length && <tr><td colSpan={6} className="muted">Nobody has connected a mailbox yet.</td></tr>}</tbody></table></div>
      {data.notConnected.length > 0 && <p className="small muted">Not connected yet: {data.notConnected.map((u) => u.name).join(", ")}. They can connect on their Account page.</p>}</>}
    <label className="chk"><input type="checkbox" disabled={!perms.admin} checked={auto.data?.enabled !== false} onChange={async (e) => { await run(() => api("/api/settings/meeting-automation", { method: "PUT", json: { enabled: e.target.checked } }), e.target.checked ? "Meeting tasks on" : "Meeting tasks off"); auto.mutate(); }} />
      When an upcoming meeting with a contact is found in someone's calendar, suggest a prep task and a follow-up task (they review and choose on the Tasks page; nothing is added automatically)</label></section>;
}
