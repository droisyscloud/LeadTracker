"use client";
import useSWR from "swr";
import { api, useData } from "./data";

/* Company page: people at this company found in synced email who aren't contacts yet. */
type P = { id: string; email: string; name: string; emails: number; lastSubject: string; lastAt: number };
export function PeopleFound({ companyId }: { companyId: string }) {
  const { run, perms } = useData(); const { data, mutate } = useSWR<{ people: P[] }>(`/api/contacts/suggestions?companyId=${companyId}`, (u: string) => fetch(u).then((r) => r.json()));
  const people = data?.people || []; if (!people.length) return null;
  return <section className="panel found-panel"><h3 style={{ margin: 0 }}>People found in your emails <span className="small muted">· {people.length}</span></h3>
    <p className="small muted" style={{ margin: 0 }}>They're on email threads with this company but aren't contacts yet. Adding one also brings in their past emails.</p>
    <ul className="found-list">{people.map((p) => <li key={p.id}><div><b>{p.name || p.email.split("@")[0]}</b> <span className="small muted">{p.email}</span>
      <div className="small muted">On {p.emails} email{p.emails === 1 ? "" : "s"} · latest {new Date(p.lastAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{p.lastSubject ? `: "${p.lastSubject}"` : ""}</div></div>
      {perms.write && <div className="found-act"><button type="button" className="btn sm primary" onClick={async () => { const name = prompt("Name for this contact:", p.name || ""); if (name === null) return;
          const r = await run(() => api<{ contactId: string; emailsLogged: number }>(`/api/contacts/suggestions/${p.id}`, { json: { action: "add", name } }), "Added as a contact") as { emailsLogged: number } | null; if (r) mutate(); }}>Add as contact</button>
        <button type="button" className="btn sm ghost" onClick={async () => { await run(() => api(`/api/contacts/suggestions/${p.id}`, { json: { action: "dismiss" } }), "Dismissed"); mutate(); }}>Dismiss</button></div>}</li>)}</ul></section>;
}
