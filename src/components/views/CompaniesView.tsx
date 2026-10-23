"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { api, useData } from "../data";
import { QuickCreate } from "../QuickCreate";
import { Icon } from "../ui";
import { ago, isOpenDeal, lastTouch, moneyShort, prodNames, STAGES, userName, webHref, webLabel, dv, taskLeadIds, taskCompanyIds } from "../model";
import { ContactDialog } from "./ContactDialog";
import { DealDialog, DealList, TaskDialog, TaskList } from "../widgets";
import { AISummary } from "../AISummary";
import { Discussion } from "../thread";
import { AiText } from "../AiText";
import { BookMeetingDialog } from "./BookMeetingDialog";
import { DirHead, Monogram, PeopleStack, StageMix, useViewMode, ViewToggle } from "../Directory";
import { activityKind, KINDS, TIMELINE_KINDS, type Kind } from "../kinds";
import { TimelineItem } from "./ContactsView";
import { DealPeriods } from "../DealPeriods";
import { dealMoney } from "../Payments";
import { LocationInput } from "../LocationInput";
import { PeopleFound } from "../PeopleFound";
import { Linkify } from "../Linkify";
import { LinkedNotes } from "../Stories";
import { BulkSelect } from "../BulkSelect";
const LinkedNotesPanel = ({ companyId }: { companyId: string }) => <section className="panel ln-panel"><LinkedNotes companyId={companyId} /></section>;

const DAY = 86400_000;

export function CompaniesView() {
  const { m, perms } = useData();
  const sp = useSearchParams(); const router = useRouter();
  const selId = sp.get("id");
  const [mode, setMode] = useViewMode("companies");
  const [qq, setQq] = useState(""); const [view, setView] = useState("all"); const [sort, setSort] = useState("az");   // alphabetical by default
  const [newCo, setNewCo] = useState(false);
  // filters: a company matches when anyone there (or any of its deals) matches
  const [showF, setShowF] = useState(false);
  const [f, setF] = useState({ product: "all", team: "all", owner: "all", event: "all", industry: "all", stage: "all" });
  const activeF = Object.values(f).filter((v) => v !== "all").length;
  const industries = [...new Set(m.companies.map((x) => x.industry).filter(Boolean))].sort();
  const rows = useMemo(() => m.companies.map((co) => {
    const people = m.contacts.filter((c) => c.companyId === co.id);
    const deals = m.deals.filter((d) => d.companyId === co.id);
    const open = deals.filter(isOpenDeal).reduce((n, d) => n + dv(d), 0);
    const won = deals.filter((d) => d.stage === "won").reduce((n, d) => n + dv(d), 0);
    const last = people.reduce((x, c) => Math.max(x, lastTouch(m, c)), co.createdAt || 0);
    return { co, people, open, won, last };
  }), [m]);
  const shown = rows.filter(({ co, people, open, won, last }) => {
    const t = qq.trim().toLowerCase();
    if (t && ![co.name, co.website, co.industry, co.location, ...people.map((p) => p.name)].join(" ").toLowerCase().includes(t)) return false;
    if (view === "open" && !open) return false;
    if (view === "won" && !won) return false;
    if (view === "quiet" && Date.now() - last < 30 * DAY) return false;
    if (f.product !== "all" && !people.some((p) => p.productIds.includes(f.product)) && !m.deals.some((d) => d.companyId === co.id && d.productId === f.product)) return false;
    if (f.team !== "all" && !people.some((p) => p.teamId === f.team) && !m.deals.some((d) => d.companyId === co.id && d.teamId === f.team)) return false;
    if (f.owner !== "all" && !people.some((p) => (f.owner === "mine" ? p.ownerId === m.me.id : f.owner === "none" ? !p.ownerId : p.ownerId === f.owner))) return false;
    if (f.event !== "all" && !people.some((p) => p.eventId === f.event)) return false;
    if (f.industry !== "all" && co.industry !== f.industry) return false;
    if (f.stage !== "all") { const at = STAGES.findIndex((s) => s[0] === f.stage); if (!people.some((p) => p.status !== "lost" && STAGES.findIndex((s) => s[0] === p.status) >= at)) return false; }
    return true;
  }).sort((a, b) => sort === "az" ? a.co.name.localeCompare(b.co.name, undefined, { sensitivity: "base" }) : sort === "pipeline" ? b.open - a.open || b.won - a.won : sort === "new" ? (b.co.createdAt || 0) - (a.co.createdAt || 0) : b.last - a.last);
  const sel = selId ? m.companyMap.get(selId) : undefined;
  if (sel) return <div className="lead-page"><div className="lead-nav"><Link href="/companies" className="btn ghost">← All companies</Link></div>
    <CompanyProfile key={sel.id} id={sel.id} /></div>;

  const VIEWS: [string, string][] = [["all", "All"], ["open", "With open deals"], ["won", "Customers"], ["quiet", "Gone quiet (30+ days)"]];
  return <div className="dir">
    <DirHead count={shown.length} noun={shown.length === 1 ? "company" : "companies"} total={m.companies.length}>
      <div className="dir-search"><Icon name="search" size={15} /><input type="search" placeholder="Search companies" aria-label="Find a company" value={qq} onChange={(e) => setQq(e.target.value)} /></div>
      <select aria-label="Sort companies" value={sort} onChange={(e) => setSort(e.target.value)}><option value="az">A to Z</option><option value="active">Most recently active</option><option value="pipeline">Biggest pipeline</option><option value="new">Recently added</option></select>
      <button type="button" className={"btn" + (showF || activeF ? " on" : "")} aria-expanded={showF} onClick={() => setShowF(!showF)}><Icon name="list" size={15} />Filters{activeF ? <span className="fcount">{activeF}</span> : null}</button>
      <ViewToggle value={mode} onChange={setMode} />
      {perms.write && <button type="button" className="btn primary" onClick={() => setNewCo(true)}>+ New company</button>}
    </DirHead>
    {newCo && <QuickCreate kind="company" onClose={() => setNewCo(false)} onCreated={(id) => router.push(`/companies?id=${id}`)} />}
    {showF && <div className="dir-filters">
      <label>Product<select aria-label="Product" value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })}><option value="all">Any product</option>{m.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      {m.teams.length > 0 && <label>Team<select aria-label="Team" value={f.team} onChange={(e) => setF({ ...f, team: e.target.value })}><option value="all">Any team</option>{m.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
      <label>Owner<select aria-label="Owner" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}><option value="all">Anyone</option><option value="mine">Mine</option>{perms.manage && <option value="none">Unassigned</option>}
        {m.users.filter((u) => u.status === "active" && u.id !== m.me.id).map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}</select></label>
      <label>Event<select aria-label="Event" value={f.event} onChange={(e) => setF({ ...f, event: e.target.value })}><option value="all">Any event</option>{m.events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
      <label>Industry<select aria-label="Industry" value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })}><option value="all">Any industry</option>{industries.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
      <label>Someone has reached<select aria-label="Stage reached" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}><option value="all">Any stage</option>{STAGES.filter((s) => s[0] !== "lost" && s[0] !== "new").map((s) => <option key={s[0]} value={s[0]}>{s[1]} or further</option>)}</select></label>
      {activeF > 0 && <button type="button" className="linkbtn" onClick={() => setF({ product: "all", team: "all", owner: "all", event: "all", industry: "all", stage: "all" })}>Clear filters</button>}
    </div>}
    <div className="quick" role="group" aria-label="Quick views">{VIEWS.map(([k, l]) => <button key={k} type="button" className="chip" aria-pressed={view === k} onClick={() => setView(k)}>{l}</button>)}</div>
    <BulkSelect kind="company" noun={["company", "companies"]} ids={shown.map((x) => x.co.id)}>
    {!shown.length ? <p className="empty dir-empty">{m.companies.length ? "No companies match." : "Companies appear here as you add contacts, or add one with New company."}</p>
      : mode === "cards" ? <div className="cards">{shown.map(({ co, people, open, won, last }) =>
        <Link key={co.id} data-sel-id={co.id} href={`/companies?id=${co.id}`} className="ocard">
          <div className="oc-top"><Monogram name={co.name} size={46} square />
            <div className="oc-id"><b>{co.name}</b><span>{co.website ? webLabel(co.website) : "No website yet"}</span></div></div>
          {(co.industry || co.location) && <div className="oc-tags">{co.industry && <span>{co.industry}</span>}{co.location && <span>{co.location}</span>}</div>}
          <div className="oc-people"><PeopleStack names={people.map((p) => p.name)} /><span>{people.length} {people.length === 1 ? "person" : "people"}</span></div>
          <StageMix people={people} />
          <div className="oc-nums"><span><small>Open</small><b className="num">{open ? moneyShort(open) : "—"}</b></span><span><small>Won</small><b className="num won">{won ? moneyShort(won) : "—"}</b></span><span><small>Active</small><b>{last ? ago(last) : "—"}</b></span></div>
        </Link>)}</div>
      : <div className="panel tbl-wrap"><table className="tbl dir-tbl"><thead><tr><th>Company</th><th>People</th><th>Furthest stage</th><th>Open pipeline</th><th>Won</th><th>Last activity</th></tr></thead>
        <tbody>{shown.map(({ co, people, open, won, last }) => { const best = people.reduce((b, c) => (c.status === "lost" ? b : Math.max(b, STAGES.findIndex((s) => s[0] === c.status))), -1);
          return <tr key={co.id} data-sel-id={co.id} tabIndex={0} onClick={() => router.push(`/companies?id=${co.id}`)} onKeyDown={(e) => { if (e.key === "Enter") router.push(`/companies?id=${co.id}`); }}>
            <td><span className="tname"><Monogram name={co.name} size={28} square /><span><b>{co.name}</b><small>{co.website ? webLabel(co.website) : ""}</small></span></span></td>
            <td>{people.length}</td><td>{best >= 0 ? <span className="spill" style={{ ["--sc" as string]: STAGES[best][2] }}>{STAGES[best][1]}</span> : "—"}</td>
            <td className="num">{open ? moneyShort(open) : "—"}</td><td className="num">{won ? moneyShort(won) : "—"}</td><td>{last ? ago(last) : "—"}</td></tr>; })}</tbody></table></div>}
    </BulkSelect>
  </div>;
}

/** A company's profile: who it is, the numbers, its people, everything that happened with anyone there. */
function CompanyProfile({ id }: { id: string }) {
  const { m, run, perms } = useData(); const router = useRouter();
  const co = m.companyMap.get(id)!;
  const people = m.contacts.filter((c) => c.companyId === id).sort((a, b) => lastTouch(m, b) - lastTouch(m, a));
  const deals = m.deals.filter((d) => d.companyId === id);
  const tasks = m.tasks.filter((t) => !t.done && (taskCompanyIds(t).includes(id) || taskLeadIds(t).some((x) => people.some((p) => p.id === x))));
  const open = deals.filter(isOpenDeal).reduce((n, d) => n + dv(d), 0); const won = deals.filter((d) => d.stage === "won").reduce((n, d) => n + dv(d), 0);
  const last = people.reduce((x, c) => Math.max(x, lastTouch(m, c)), 0);
  const cash = deals.filter((d) => d.stage === "won").reduce((t, d) => { const x = dealMoney(m, d); return { received: t.received + x.received, pending: t.pending + x.pending, overdue: t.overdue + x.overdue }; }, { received: 0, pending: 0, overdue: 0 });
  const ids = new Set(people.map((p) => p.id));
  const [noteEdit, setNoteEdit] = useState<string | null>(null);
  const allFeed = m.activities.filter((a) => ids.has(a.contactId)).sort((a, b) => b.at - a.at);
  // the same person entered twice (same name, or a shared email) splits their emails and meetings across records
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const dupGroups = (() => { const g = new Map<string, typeof people>(); for (const p of people) { const keys = [norm(p.name), ...[p.email, ...(p.otherEmails || [])].filter(Boolean).map((e) => e.toLowerCase())];
    for (const k of keys) if (k) g.set(k, [...(g.get(k) || []), p]); } const seen = new Set<string>(); const out: (typeof people)[] = [];
    for (const list of g.values()) { const u = [...new Map(list.map((p) => [p.id, p])).values()]; if (u.length < 2) continue; const key = u.map((p) => p.id).sort().join(","); if (seen.has(key)) continue; seen.add(key); out.push(u); } return out; })();
  const [kindF, setKindF] = useState<Kind | "all">("all"); const [feedN, setFeedN] = useState(30); const [by, setBy] = useState<"month" | "quarter" | "year">("quarter");
  const kindCounts = useMemo(() => { const n: Partial<Record<Kind, number>> = {}; for (const a of allFeed) { const k = activityKind(a); n[k] = (n[k] || 0) + 1; } return n; }, [allFeed]);
  const shownFeed = kindF === "all" ? allFeed : allFeed.filter((a) => activityKind(a) === kindF);
  const feed = shownFeed.slice(0, feedN);
  const prods = new Map<string, number>(); for (const c of people) for (const n of prodNames(m, c)) prods.set(n, (prods.get(n) || 0) + 1);
  const [edit, setEdit] = useState(false); const [meet, setMeet] = useState(false); const [deal, setDeal] = useState(false); const [task, setTask] = useState(false); const [add, setAdd] = useState(false);
  const [name, setName] = useState(co.name); const [web, setWeb] = useState(co.website); const [notes, setNotes] = useState(co.notes);
  const [info, setInfo] = useState({ description: co.description, industry: co.industry, location: co.location, employees: co.employees });
  const [busy, setBusy] = useState(false); const [target, setTarget] = useState("");
  const save = async () => { if (await run(() => api(`/api/companies/${id}`, { method: "PATCH", json: { name, website: web, notes, ...info } }), "Company saved")) setEdit(false); };

  return <div className="profile">
    <section className="panel prof-hero">
      <Monogram name={co.name} size={72} square />
      <div className="ph-id">
        <h2>{co.name}</h2>
        <div className="ph-meta">{co.website && <a href={webHref(co.website)} target="_blank" rel="noopener noreferrer">{webLabel(co.website)} ↗</a>}
          {[co.industry, co.location, co.employees && `${co.employees} employees`].filter(Boolean).map((x) => <span key={String(x)}>{x}</span>)}</div>
        {co.description && <p>{co.description}</p>}
      </div>
      <div className="ph-act">
        {perms.write && <button className="btn" onClick={() => setEdit(!edit)}>{edit ? "Close editing" : "Edit details"}</button>}
        {perms.write && m.connection && <button className="btn" onClick={() => setMeet(true)}>Book meeting</button>}
        {perms.write && <button className="btn" onClick={() => setDeal(true)}>+ Deal</button>}
        {perms.write && <button className="btn primary" onClick={() => setAdd(true)}>+ Person</button>}
      </div>
      <div className="ph-stats">
        <span><small>People</small><b className="num">{people.length}</b></span>
        <span><small>Open pipeline</small><b className="num">{open ? moneyShort(open) : "—"}</b></span>
        <span><small>Won</small><b className="num won">{won ? moneyShort(won) : "—"}</b></span>
        <span><small>Received</small><b className="num won">{cash.received ? moneyShort(cash.received) : "—"}</b></span>
        <span><small>Pending</small><b className={"num" + (cash.overdue ? " late" : "")}>{cash.pending ? moneyShort(cash.pending) : "—"}</b></span>
        <span><small>Last activity</small><b>{last ? ago(last) : "—"}</b></span>
        <span className="ph-mix"><small>Where everyone is</small><StageMix people={people} /></span>
      </div>
    </section>
    {edit && perms.write && <section className="panel"><div className="fields" style={{ gridTemplateColumns: "1fr 1fr", borderTop: 0, marginTop: 0, paddingTop: 0 }}>
      <label>Company name<input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Website<input type="text" placeholder="example.com" value={web} onChange={(e) => setWeb(e.target.value)} /></label>
      <label>Industry<input type="text" value={info.industry} onChange={(e) => setInfo({ ...info, industry: e.target.value })} /></label>
      <label>Location<LocationInput value={info.location} onChange={(v) => setInfo({ ...info, location: v })} /></label>
      <label>Employees<input type="text" value={info.employees} placeholder="e.g. 200-500" onChange={(e) => setInfo({ ...info, employees: e.target.value })} /></label>
      <label>Description<input type="text" value={info.description} onChange={(e) => setInfo({ ...info, description: e.target.value })} /></label>
      <label style={{ gridColumn: "1/-1" }}>Notes<AiText kind="note" rows={3} style={{ minHeight: 70 }} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <div className="inline" style={{ gridColumn: "1/-1", flexWrap: "wrap" }}>
        <button className="btn primary" onClick={save}>Save company</button><span className="small muted">Empty a field to remove that detail. To remove people, use the buttons under each person below.</span>
        {co.website && <button className="btn" disabled={busy} title="Reads their website" onClick={async () => { setBusy(true); const r = await run(() => api<{ description: string; industry: string; location: string; employees: string }>(`/api/companies/${id}/enrich`, { json: {} }), "Filled in from their website"); setBusy(false); if (r) setInfo({ description: r.description || info.description, industry: r.industry || info.industry, location: r.location || info.location, employees: r.employees || info.employees }); }}>{busy ? "Reading…" : "Fill in from website"}</button>}
        {perms.manage && m.companies.length > 1 && <><select aria-label="Merge into" value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: "auto", flex: "1 1 200px" }}>
          <option value="">Merge into another company…</option>{m.companies.filter((x) => x.id !== id).sort((a, b) => a.name.localeCompare(b.name)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <button className="btn" disabled={!target} onClick={async () => { const t = m.companyMap.get(target); if (!t || !confirm(`Move ${people.length} people into ${t.name} and remove ${co.name}?`)) return;
            const r = await run(() => api(`/api/companies/${id}/merge`, { json: { targetId: target } }), "Companies merged"); if (r) router.push(`/companies?id=${target}`); }}>Merge</button></>}
        {perms.manage && !people.length && <button className="btn danger" onClick={async () => { if (!confirm("Delete this company?")) return; const r = await run(() => api(`/api/companies/${id}`, { method: "DELETE" }), "Moved to the recycle bin"); if (r) router.push("/companies"); }}>Delete company</button>}
      </div></div></section>}
    <div className="prof-cols">
      <div className="prof-main">
        <section className="panel"><div className="sec-h"><h3>People</h3><span className="small muted">{people.length}</span></div>
          {people.length ? <BulkSelect kind="contact" noun={["person", "people"]} ids={people.map((c) => c.id)}><div className="mini-cards">{people.map((c) => { const st = STAGES.find((s) => s[0] === c.status)!;
            return <div key={c.id} className="mcard-wrap"><Link data-sel-id={c.id} href={`/contacts?id=${c.id}`} className="mcard" style={{ ["--sc" as string]: st[2] }}><Monogram name={c.name} size={36} />
              <span className="mc-id"><b>{c.name}</b><small>{c.title || "No title"}</small></span><span className="spill">{st[1]}</span></Link>
              {edit && perms.write && <div className="mc-acts">
                <button type="button" className="linkbtn small" onClick={async () => { if (confirm(`Remove ${c.name} from ${co.name}? They stay as a contact, just without this company.`)) await run(() => api(`/api/contacts/${c.id}`, { method: "PATCH", json: { company: "" } }), `${c.name} removed from ${co.name}`); }}>Remove from company</button>
                <button type="button" className="linkbtn small danger-text" onClick={async () => { if (confirm(`Delete ${c.name}? They go to the recycle bin, where you can restore them.`)) await run(() => api(`/api/contacts/${c.id}`, { method: "DELETE" }), `${c.name} deleted`); }}>Delete</button></div>}</div>; })}</div></BulkSelect>
            : <p className="empty">No one from this company yet.</p>}</section>
        <section className="panel"><div className="sec-h"><h3>Everything that happened</h3><span className="small muted">with anyone at {co.name}</span></div>
          <PeopleFound companyId={id} />
          {dupGroups.map((g) => { const primary = g.reduce((x, y) => ((m.actsByContact.get(y.id)?.length || 0) > (m.actsByContact.get(x.id)?.length || 0) ? y : x));
            return <div key={g.map((p) => p.id).join()} className="banner dup-banner" role="status">⚠ <b>{g[0].name}</b> looks like it's here {g.length} times ({g.map((p) => `${p.name}${p.email ? ` · ${p.email}` : " · no email"} · ${m.actsByContact.get(p.id)?.length || 0} activities`).join("; ")}). Their emails and meetings are split between these records.
              {!perms.manage && <span className="small muted">Ask a manager or admin to merge these.</span>}
              {perms.manage && <button type="button" className="btn sm" onClick={async () => { if (!confirm(`Merge into ${primary.name}${primary.email ? ` (${primary.email})` : ""}? All emails, meetings, notes, tasks and deals move to one record, and the other email addresses are kept.`)) return;
                await run(() => api("/api/contacts/merge", { json: { primaryId: primary.id, duplicateIds: g.filter((p) => p.id !== primary.id).map((p) => p.id) } }), "Merged into one contact"); }}>Merge into one</button>}</div>; })}
          {allFeed.length > 0 && <div className="tl-filter" role="group" aria-label="Show only">
            <button type="button" className="chip" aria-pressed={kindF === "all"} onClick={() => setKindF("all")}>All <span className="n">{allFeed.length}</span></button>
            {TIMELINE_KINDS.filter((k) => kindCounts[k]).map((k) => <button key={k} type="button" className={"chip kchip k-" + k} style={{ ["--kc" as string]: KINDS[k].color }} aria-pressed={kindF === k} onClick={() => setKindF(kindF === k ? "all" : k)}>
              <Icon name={KINDS[k].icon} size={13} />{KINDS[k].plural} <span className="n">{kindCounts[k]}</span></button>)}
          </div>}
          {feed.length ? <ul className="timeline">{feed.map((a) => <TimelineItem key={a.id} a={a} showLead />)}</ul>
            : <p className="empty">{allFeed.length ? "Nothing of this kind yet." : "Nothing logged with anyone here yet."}</p>}
          {shownFeed.length > feed.length && <div className="dir-more"><button className="btn" onClick={() => setFeedN(feedN + 30)}>Show more</button></div>}
        </section>
        {deals.length > 0 && <DealPeriods deals={deals} by={by} onBy={setBy} payments={m.payments.filter((p) => deals.some((d) => d.id === p.dealId))} />}
      </div>
      <aside className="prof-side">
        <AISummary scope="company" id={id} />
        <section className="panel"><div className="sec-h"><h3>Deals</h3>{perms.write && <button className="linkbtn" onClick={() => setDeal(true)}>+ Add deal</button>}</div><DealList deals={deals} showCompany={false} /></section>
        <section className="panel"><div className="sec-h"><h3>Open tasks</h3>{perms.write && <button className="linkbtn" onClick={() => setTask(true)}>+ Add task</button>}</div><TaskList tasks={tasks} /></section>
        <LinkedNotesPanel companyId={id} />
        <section className="panel"><div className="sec-h"><h3>Products of interest</h3></div>
          {prods.size ? <div className="chips" style={{ marginTop: 0 }}>{[...prods.entries()].map(([n, k]) => <span key={n} className="pill">{n} · {k}</span>)}</div> : <p className="empty">No products tagged yet.</p>}</section>
        {(co.notes || noteEdit !== null) && !edit && <section className="panel k-note-card"><div className="sec-h"><h3>Notes</h3>{perms.write && noteEdit === null && <button type="button" className="linkbtn small" onClick={() => setNoteEdit(co.notes || "")}>Edit</button>}</div>
          {noteEdit !== null ? <><textarea rows={Math.min(14, Math.max(4, noteEdit.split("\n").length + 1))} value={noteEdit} onChange={(e) => setNoteEdit(e.target.value)} aria-label="Company notes" autoFocus />
            <div className="btns"><button type="button" className="btn sm primary" onClick={async () => { if (await run(() => api(`/api/companies/${co.id}`, { method: "PATCH", json: { notes: noteEdit } }), "Notes saved")) setNoteEdit(null); }}>Save</button><button type="button" className="btn sm ghost" onClick={() => setNoteEdit(null)}>Cancel</button></div></>
          : <p style={{ whiteSpace: "pre-wrap", margin: 0 }}><Linkify text={co.notes} /></p>}</section>}
        <section className="panel"><details className="disc-wrap" open><summary><h3 className="section-h" style={{ display: "inline", margin: 0 }}>Team discussion</h3></summary><div style={{ marginTop: 10 }}><Discussion type="company" id={id} /></div></details></section>
      </aside>
    </div>
    {meet && <BookMeetingDialog companyId={id} onClose={() => setMeet(false)} />}
    {deal && <DealDialog companyId={id} onClose={() => setDeal(false)} />}
    {task && <TaskDialog companyId={id} onClose={() => setTask(false)} />}
    {add && <ContactDialog presetCompanyId={id} onClose={() => setAdd(false)} />}
  </div>;
}
