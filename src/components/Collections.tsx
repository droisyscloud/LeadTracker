"use client";
import { useMemo, useState } from "react";
import type { BillingDTO, FollowupDTO, ProjectDTO, SowExpenseDTO } from "@/lib/types";
import { api, Modal, useData } from "./data";
import { money, todayStr, userName } from "./model";
import { Icon } from "./ui";

/* Collections (follow-ups and payment promises on unpaid invoices), projects, and SOW expenses. */
const TYPE: Record<string, string> = { call: "Call", email: "Email", meeting: "Meeting", other: "Other" };
const OUTCOME: Record<string, string> = { "": "—", no_answer: "No answer", left_message: "Left a message", promised: "Promised to pay", disputed: "Disputed", paid: "Paid", other: "Other" };
const PRIORITY: Record<string, string> = { high: "High", normal: "Normal", low: "Low" };
const fmt = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : "—");
export const dueOf = (b: BillingDTO) => b.paymentDue || b.dueDate;
export const outstanding = (b: BillingDTO) => b.kind === "invoice" && b.status === "invoiced";
export function promiseState(f: FollowupDTO, item?: BillingDTO): "kept" | "broken" | "pending" | null {
  if (!f.promiseDate) return null; if (item?.status === "paid") return "kept"; return f.promiseDate < todayStr() ? "broken" : "pending";
}
function useLookups() {
  const { m } = useData();
  const deal = (id: string) => m.deals.find((d) => d.id === id);
  const company = (b?: BillingDTO) => { const d = b && deal(b.dealId); return d?.companyId ? m.companies.find((c) => c.id === d.companyId) : undefined; };
  const sowCur = (b?: BillingDTO) => (b?.sowId ? m.sows.find((s) => s.id === b.sowId)?.currency : undefined) || "USD";
  return { deal, company, sowCur };
}

/** Add or update a follow-up, with "fill in from my note" (AI). */
function FollowupForm({ item, f, onDone }: { item: BillingDTO; f?: FollowupDTO; onDone: () => void }) {
  const { m, run } = useData();
  const [v, setV] = useState({ assigneeId: f?.assigneeId || m.me.id, type: f?.type || "call", priority: f?.priority || "normal", dueDate: f?.dueDate || todayStr(), status: f?.status || "open",
    outcome: f?.outcome || "", notes: f?.notes || "", promiseDate: f?.promiseDate || "", promiseAmount: f?.promiseAmount != null ? String(f.promiseAmount) : "" });
  const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const fill = async () => { setBusy(true); const r = await run(() => api<{ outcome: string; promiseDate: string | null; promiseAmount: number | null; type: string; nextDate: string | null; summary: string }>("/api/ai/collections/parse", { json: { billingItemId: item.id, text: note } }));
    setBusy(false); if (!r) return;
    setV({ ...v, type: r.type as typeof v.type, outcome: r.outcome as typeof v.outcome, promiseDate: r.promiseDate || "", promiseAmount: r.promiseAmount != null ? String(r.promiseAmount) : "", notes: r.summary, status: "done" });
    if (r.nextDate) setNext(r.nextDate); };
  const [next, setNext] = useState("");
  const save = async () => {
    const json = { ...v, promiseDate: v.promiseDate || null, promiseAmount: v.promiseAmount ? Number(v.promiseAmount) : null };
    const ok = await run(() => f ? api(`/api/followups/${f.id}`, { method: "PATCH", json }) : api("/api/followups", { json: { ...json, billingItemId: item.id } }), "Follow-up saved");
    if (ok && next && v.status === "done") await run(() => api("/api/followups", { json: { billingItemId: item.id, assigneeId: v.assigneeId, type: v.type, priority: v.priority, dueDate: next } }), `Next follow-up set for ${fmt(next)}`);
    if (ok) onDone();
  };
  return <div className="form fu-form">
    {m.config.ai && <div className="fu-ai"><label>Log it in your own words<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Spoke to Jane in AP, she'll pay half by the 20th" /></label>
      <button type="button" className="btn sm" disabled={note.trim().length < 3 || busy} onClick={fill}>✨ {busy ? "Reading…" : "Fill in from my note"}</button></div>}
    <div className="fu-grid">
      <label>Assigned to<select value={v.assigneeId} onChange={(e) => setV({ ...v, assigneeId: e.target.value })}>{m.users.filter((u) => u.status === "active").map((u) => <option key={u.id} value={u.id}>{userName(m, u.id)}</option>)}</select></label>
      <label>Type<select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as typeof v.type })}>{Object.entries(TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label>Priority<select value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value as typeof v.priority })}>{Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label>Follow up on<input type="date" value={v.dueDate} onChange={(e) => setV({ ...v, dueDate: e.target.value })} /></label>
      <label>Outcome<select value={v.outcome} onChange={(e) => setV({ ...v, outcome: e.target.value as typeof v.outcome })}>{Object.entries(OUTCOME).map(([k, l]) => <option key={k} value={k}>{k ? l : "Not yet"}</option>)}</select></label>
      <label>Status<select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as typeof v.status })}><option value="open">Open</option><option value="done">Done</option></select></label>
      <label>Promised to pay by<input type="date" value={v.promiseDate} onChange={(e) => setV({ ...v, promiseDate: e.target.value })} /></label>
      <label>Promised amount<input type="number" min="0" step="any" value={v.promiseAmount} onChange={(e) => setV({ ...v, promiseAmount: e.target.value })} /></label>
    </div>
    <label>Notes<textarea rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></label>
    {v.status === "done" && <label>Next follow-up (optional)<input type="date" value={next} onChange={(e) => setNext(e.target.value)} /></label>}
    <div className="btns"><button type="button" className="btn primary" onClick={save}>Save follow-up</button><button type="button" className="btn ghost" onClick={onDone}>Cancel</button></div>
  </div>;
}

/** AI-drafted payment reminder: open in Gmail, copy, or log it as sent. */
function Reminder({ item, onDone }: { item: BillingDTO; onDone: () => void }) {
  const { run, toast } = useData();
  const [d, setD] = useState<{ to: string; subject: string; body: string } | null>(null); const [asked, setAsked] = useState(false);
  if (!asked) { setAsked(true); run(() => api<{ to: string; subject: string; body: string }>("/api/ai/collections/reminder", { json: { billingItemId: item.id } })).then((r) => (r ? setD(r) : onDone())); }
  const gmail = d ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(d.to)}&su=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}` : "#";
  const logged = async () => { if (await run(() => api("/api/followups", { json: { billingItemId: item.id, type: "email", status: "done", dueDate: todayStr(), outcome: "other", notes: `Reminder sent: ${d?.subject}` } }), "Logged as a follow-up")) onDone(); };
  return <div className="form fu-form">{!d ? <p className="muted">✨ Writing the reminder…</p> : <>
    <label>To<input type="email" value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })} placeholder="Billing contact's email" /></label>
    <label>Subject<input type="text" value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} /></label>
    <label>Message<textarea rows={8} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} /></label>
    <div className="btns"><a className="btn primary" href={gmail} target="_blank" rel="noreferrer">Open in Gmail</a>
      <button type="button" className="btn" onClick={() => { navigator.clipboard?.writeText(`${d.subject}\n\n${d.body}`); toast("Copied"); }}>Copy</button>
      <button type="button" className="btn" onClick={logged}>Log as sent</button><button type="button" className="btn ghost" onClick={onDone}>Close</button></div></>}</div>;
}

export function CollectionsView() {
  const { m, run, perms } = useData(); const L = useLookups(); const t = todayStr();
  const fus = (m.followups || []) as FollowupDTO[];
  const items = m.billing.filter(outstanding);
  const itemOf = (id: string) => m.billing.find((b) => b.id === id);
  const [sub, setSub] = useState<"queue" | "none">("queue"); const [chip, setChip] = useState<"" | "today" | "overdue" | "upcoming" | "pending" | "broken">("");
  const [who, setWho] = useState("all"); const [co, setCo] = useState("all"); const [type, setType] = useState("all"); const [outcome, setOutcome] = useState("all"); const [prio, setPrio] = useState("all"); const [status, setStatus] = useState("open");
  const [form, setForm] = useState<{ item: BillingDTO; f?: FollowupDTO; mode: "form" | "reminder" } | null>(null);
  const counts = useMemo(() => ({ today: fus.filter((f) => f.status === "open" && f.dueDate === t).length, overdue: fus.filter((f) => f.status === "open" && f.dueDate < t).length,
    upcoming: fus.filter((f) => f.status === "open" && f.dueDate > t).length, pending: fus.filter((f) => promiseState(f, itemOf(f.billingItemId)) === "pending").length,
    broken: fus.filter((f) => promiseState(f, itemOf(f.billingItemId)) === "broken").length, none: items.filter((b) => !fus.some((f) => f.billingItemId === b.id && f.status === "open")).length }), [m]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = fus.filter((f) => { const it = itemOf(f.billingItemId); const c = L.company(it);
    if (chip === "today" && !(f.status === "open" && f.dueDate === t)) return false; if (chip === "overdue" && !(f.status === "open" && f.dueDate < t)) return false;
    if (chip === "upcoming" && !(f.status === "open" && f.dueDate > t)) return false; if (chip === "pending" && promiseState(f, it) !== "pending") return false; if (chip === "broken" && promiseState(f, it) !== "broken") return false;
    if (!chip && status !== "all" && f.status !== status) return false;
    return (who === "all" || f.assigneeId === who) && (co === "all" || c?.id === co) && (type === "all" || f.type === type) && (outcome === "all" || f.outcome === outcome) && (prio === "all" || f.priority === prio);
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const none = items.filter((b) => !fus.some((f) => f.billingItemId === b.id && f.status === "open")).sort((a, b) => (dueOf(a) || "").localeCompare(dueOf(b) || ""));
  const companies = [...new Map(items.map((b) => L.company(b)).filter(Boolean).map((c) => [c!.id, c!])).values()];
  const cards: [string, number, string, () => void][] = [["Due today", counts.today, "var(--blue)", () => { setSub("queue"); setChip("today"); }], ["Overdue follow-ups", counts.overdue, "var(--cold)", () => { setSub("queue"); setChip("overdue"); }],
    ["Upcoming", counts.upcoming, "var(--cyan)", () => { setSub("queue"); setChip("upcoming"); }], ["Promises pending", counts.pending, "var(--mild)", () => { setSub("queue"); setChip("pending"); }],
    ["Broken promises", counts.broken, "var(--cold)", () => { setSub("queue"); setChip("broken"); }], ["Unpaid, no follow-up", counts.none, "var(--violet)", () => setSub("none")]];
  return <div className="dir coll">
    <div className="kpis coll-cards">{cards.map(([l, n, c, go]) => <button key={l} type="button" className="panel kpi" style={{ ["--k" as string]: c }} onClick={go}><div className="lab">{l}</div><span className="val">{n}</span><div className="sub">{l === "Unpaid, no follow-up" ? "invoices nobody is chasing" : "select to see them"}</div></button>)}</div>
    <div className="vt" role="tablist" aria-label="Collections"><button type="button" role="tab" aria-pressed={sub === "queue"} aria-selected={sub === "queue"} onClick={() => setSub("queue")}><span>Follow-up queue</span></button>
      <button type="button" role="tab" aria-pressed={sub === "none"} aria-selected={sub === "none"} onClick={() => setSub("none")}><span>Invoices without follow-up</span> <span className="n">{counts.none}</span></button></div>
    {form && <Modal open label={form.mode === "reminder" ? "Payment reminder" : "Follow-up"} onClose={() => setForm(null)}><div className="dlg">
      <div className="dlg-h"><b>{form.mode === "reminder" ? "✨ Payment reminder" : form.f ? "Update follow-up" : "Add a follow-up"}</b><span className="small muted">{[form.item.label, L.company(form.item)?.name, money(form.item.amount, L.sowCur(form.item)), `due ${fmt(dueOf(form.item))}`].filter(Boolean).join(" · ")}</span></div>
      {form.mode === "reminder" ? <Reminder item={form.item} onDone={() => setForm(null)} /> : <FollowupForm item={form.item} f={form.f} onDone={() => setForm(null)} />}</div></Modal>}
    {sub === "queue" ? <>
      <div className="quick" role="group" aria-label="Show">{([["", "All"], ["today", "Due today"], ["overdue", "Overdue"], ["upcoming", "Upcoming"], ["pending", "Promise pending"], ["broken", "Broken promise"]] as [typeof chip, string][]).map(([k, l]) => <button key={k || "all"} type="button" className="chip" aria-pressed={chip === k} onClick={() => setChip(k)}>{l}</button>)}</div>
      <div className="bill-filters">
        <select aria-label="Assigned to" value={who} onChange={(e) => setWho(e.target.value)}><option value="all">Anyone</option>{m.users.map((u) => <option key={u.id} value={u.id}>{userName(m, u.id)}</option>)}</select>
        <select aria-label="Client" value={co} onChange={(e) => setCo(e.target.value)}><option value="all">All clients</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)}><option value="all">Any type</option>{Object.entries(TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select aria-label="Outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}><option value="all">Any outcome</option>{Object.entries(OUTCOME).filter(([k]) => k).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select aria-label="Priority" value={prio} onChange={(e) => setPrio(e.target.value)}><option value="all">Any priority</option>{Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {!chip && <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="open">Open</option><option value="done">Done</option><option value="all">Open and done</option></select>}
      </div>
      <section className="panel"><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Invoice</th><th>Follow up on</th><th>Assigned to</th><th>Type</th><th>Priority</th><th>Outcome</th><th>Promise</th><th /></tr></thead>
        <tbody>{rows.map((f) => { const it = itemOf(f.billingItemId); if (!it) return null; const ps = promiseState(f, it);
          return <tr key={f.id} className={f.status === "open" && f.dueDate < t ? "late" : ""}><td><b>{it.label}</b><br /><span className="small muted">{L.company(it)?.name} · {money(it.amount, L.sowCur(it))}{it.invoiceNumber ? ` · ${it.invoiceNumber}` : ""}</span></td>
            <td>{fmt(f.dueDate)}{f.status === "open" && f.dueDate < t ? <span className="pill fu-late">overdue</span> : f.status === "done" ? <span className="pill">done</span> : null}</td><td>{f.assigneeId ? userName(m, f.assigneeId) : "—"}</td><td>{TYPE[f.type]}</td>
            <td><span className={"pill fu-p-" + f.priority}>{PRIORITY[f.priority]}</span></td><td>{OUTCOME[f.outcome]}{f.notes ? <div className="small muted fu-note">{f.notes}</div> : null}</td>
            <td>{ps ? <span className={"pill fu-pr-" + ps}>{money(f.promiseAmount ?? it.amount, L.sowCur(it))} by {fmt(f.promiseDate)} · {ps === "broken" ? "broken" : ps === "kept" ? "kept" : "pending"}</span> : "—"}</td>
            <td className="n">{perms.write && <>{f.status === "open" && <button type="button" className="btn sm primary" onClick={() => setForm({ item: it, f, mode: "form" })}>Log outcome</button>}
              {f.status === "done" && <button type="button" className="linkbtn small" onClick={() => setForm({ item: it, f, mode: "form" })}>Edit</button>}
              {m.config.ai && <button type="button" className="linkbtn small" onClick={() => setForm({ item: it, mode: "reminder" })}>✨ Reminder</button>}
              <button type="button" className="linkbtn small" style={{ color: "var(--muted)" }} onClick={() => { if (confirm("Delete this follow-up?")) run(() => api(`/api/followups/${f.id}`, { method: "DELETE" }), "Deleted"); }}>Delete</button></>}</td></tr>; })}
          {!rows.length && <tr><td colSpan={8} className="muted">No follow-ups here. Add one from “Invoices without follow-up”.</td></tr>}</tbody></table></div></section>
    </> : <section className="panel"><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Invoice</th><th>Client</th><th className="n">Amount</th><th>Payment due</th><th>Late by</th><th /></tr></thead>
      <tbody>{none.map((b) => { const due = dueOf(b); const late = due && due < t ? Math.floor((Date.now() - new Date(`${due}T12:00:00`).getTime()) / 86400_000) : 0;
        return <tr key={b.id}><td><b>{b.label}</b>{b.invoiceNumber ? <><br /><span className="small muted">{b.invoiceNumber}</span></> : null}</td><td>{L.company(b)?.name || "—"}</td><td className="n num">{money(b.amount, L.sowCur(b))}</td>
          <td>{fmt(due)}</td><td className={late ? "late" : ""}>{late ? `${late} day${late === 1 ? "" : "s"}` : "not yet due"}</td>
          <td className="n">{perms.write && <><button type="button" className="btn sm primary" onClick={() => setForm({ item: b, mode: "form" })}>+ Follow-up</button> {m.config.ai && <button type="button" className="btn sm" onClick={() => setForm({ item: b, mode: "reminder" })}>✨ Draft reminder</button>}</>}</td></tr>; })}
        {!none.length && <tr><td colSpan={6} className="muted">Every unpaid invoice has a follow-up. Nice.</td></tr>}</tbody></table></div></section>}
  </div>;
}

export function ProjectsView() {
  const { m, run, perms } = useData(); const projects = (m.projects || []) as ProjectDTO[];
  const [co, setCo] = useState("all"); const [edit, setEdit] = useState<ProjectDTO | "new" | null>(null);
  const [v, setV] = useState({ name: "", companyId: "", description: "" });
  const open = (p: ProjectDTO | "new") => { setEdit(p); setV(p === "new" ? { name: "", companyId: co !== "all" ? co : "", description: "" } : { name: p.name, companyId: p.companyId || "", description: p.description }); };
  const save = async () => { const json = { name: v.name, companyId: v.companyId || null, description: v.description };
    if (await run(() => edit === "new" ? api("/api/projects", { json }) : api(`/api/projects/${(edit as ProjectDTO).id}`, { method: "PATCH", json }), "Project saved")) setEdit(null); };
  const shown = projects.filter((p) => co === "all" || p.companyId === co);
  return <div className="dir">
    <div className="dir-head"><div className="dir-count"><b className="num">{shown.length}</b><span>project{shown.length === 1 ? "" : "s"} · an optional way to group a client's SOWs</span></div>
      <div className="dir-tools"><select aria-label="Client" value={co} onChange={(e) => setCo(e.target.value)}><option value="all">All clients</option>{m.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        {perms.write && <button type="button" className="btn primary" onClick={() => open("new")}>+ Project</button>}</div></div>
    {edit && <section className="panel form fu-form"><div className="fu-grid"><label>Project name<input type="text" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
      <label>Client<select value={v.companyId} onChange={(e) => setV({ ...v, companyId: e.target.value })}><option value="">—</option>{m.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>
      <label>Description<textarea rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></label>
      <div className="btns"><button type="button" className="btn primary" disabled={!v.name.trim()} onClick={save}>Save project</button><button type="button" className="btn ghost" onClick={() => setEdit(null)}>Cancel</button></div></section>}
    <section className="panel"><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Project</th><th>Client</th><th>SOWs</th><th className="n">SOW value</th><th>Status</th><th /></tr></thead>
      <tbody>{shown.map((p) => { const sw = m.sows.filter((s) => s.projectId === p.id);
        return <tr key={p.id} className={p.active ? "" : "muted"}><td><b>{p.name}</b>{p.description ? <div className="small muted">{p.description}</div> : null}</td><td>{m.companies.find((c) => c.id === p.companyId)?.name || "—"}</td>
          <td>{sw.map((s) => s.sowNumber || s.title).join(", ") || "—"}</td><td className="n num">{money(sw.reduce((n, s) => n + (s.value || 0), 0))}</td><td>{p.active ? "Active" : "Inactive"}</td>
          <td className="n">{perms.write && <><button type="button" className="linkbtn small" onClick={() => open(p)}>Edit</button>
            <button type="button" className="linkbtn small" onClick={() => run(() => api(`/api/projects/${p.id}`, { method: "PATCH", json: { active: !p.active } }), p.active ? "Switched off" : "Switched on")}>{p.active ? "Switch off" : "Switch on"}</button>
            <button type="button" className="linkbtn small" style={{ color: "var(--muted)" }} onClick={() => { if (confirm(`Delete ${p.name}? Its SOWs stay, without a project.`)) run(() => api(`/api/projects/${p.id}`, { method: "DELETE" }), "Deleted"); }}>Delete</button></>}</td></tr>; })}
        {!shown.length && <tr><td colSpan={6} className="muted">No projects yet.</td></tr>}</tbody></table></div></section></div>;
}

const ETYPE: Record<string, string> = { employee: "Employee cost", contractor: "Contractor", tools: "Tools & licences", travel: "Travel", other: "Other" };
export function ExpensesView() {
  const { m, run, perms } = useData(); const ex = (m.sowExpenses || []) as SowExpenseDTO[];
  const [co, setCo] = useState("all"); const [sowF, setSowF] = useState("all"); const [type, setType] = useState("all"); const [act, setAct] = useState("active");
  const [edit, setEdit] = useState<SowExpenseDTO | "new" | null>(null);
  const blank = { sowId: m.sows[0]?.id || "", type: "employee", name: "", calc: "one_time", planned: "", actual: "", currency: "USD", startDate: todayStr(), endDate: "", notes: "" };
  const [v, setV] = useState<Record<string, string>>(blank);
  const sowOf = (id: string) => m.sows.find((s) => s.id === id); const coOf = (sowId: string) => { const d = m.deals.find((x) => x.id === sowOf(sowId)?.dealId); return m.companies.find((c) => c.id === d?.companyId); };
  const open = (e: SowExpenseDTO | "new") => { setEdit(e); setV(e === "new" ? blank : { sowId: e.sowId, type: e.type, name: e.name, calc: e.calc, planned: String(e.planned), actual: e.actual != null ? String(e.actual) : "", currency: e.currency, startDate: e.startDate || "", endDate: e.endDate || "", notes: e.notes }); };
  const save = async () => { const json = { ...v, planned: Number(v.planned) || 0, actual: v.actual === "" ? null : Number(v.actual), startDate: v.startDate || null, endDate: v.endDate || null };
    if (await run(() => edit === "new" ? api("/api/sow-expenses", { json }) : api(`/api/sow-expenses/${(edit as SowExpenseDTO).id}`, { method: "PATCH", json: { ...json, sowId: undefined } }), "Expense saved")) setEdit(null); };
  const shown = ex.filter((e) => (co === "all" || coOf(e.sowId)?.id === co) && (sowF === "all" || e.sowId === sowF) && (type === "all" || e.type === type) && (act === "all" || (act === "active") === e.active));
  const planned = shown.reduce((n, e) => n + e.planned, 0), actual = shown.reduce((n, e) => n + (e.actual || 0), 0);
  return <div className="dir">
    <div className="dir-head"><div className="dir-count"><b className="num">{shown.length}</b><span>expense{shown.length === 1 ? "" : "s"} · planned {money(planned)} · actual {money(actual)}</span></div>
      {perms.write && <div className="dir-tools"><button type="button" className="btn primary" disabled={!m.sows.length} onClick={() => open("new")}>+ Expense</button></div>}</div>
    <div className="bill-filters">
      <select aria-label="Client" value={co} onChange={(e) => setCo(e.target.value)}><option value="all">All clients</option>{m.companies.filter((c) => m.sows.some((s) => coOf(s.id)?.id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select aria-label="SOW" value={sowF} onChange={(e) => setSowF(e.target.value)}><option value="all">All SOWs</option>{m.sows.map((s) => <option key={s.id} value={s.id}>{s.sowNumber || s.title || "SOW"}</option>)}</select>
      <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)}><option value="all">Any type</option>{Object.entries(ETYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <select aria-label="Status" value={act} onChange={(e) => setAct(e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option></select></div>
    {edit && <section className="panel form fu-form"><div className="fu-grid">
      <label>SOW<select value={v.sowId} disabled={edit !== "new"} onChange={(e) => setV({ ...v, sowId: e.target.value })}>{m.sows.map((s) => <option key={s.id} value={s.id}>{(s.sowNumber || s.title || "SOW") + " · " + (coOf(s.id)?.name || "")}</option>)}</select></label>
      <label>Type<select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>{Object.entries(ETYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label>Name<input type="text" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Software developer" /></label>
      <label>Calculation<select value={v.calc} onChange={(e) => setV({ ...v, calc: e.target.value })}><option value="one_time">One-time amount</option><option value="monthly">Monthly amount</option></select></label>
      <label>Planned amount<input type="number" min="0" step="any" value={v.planned} onChange={(e) => setV({ ...v, planned: e.target.value })} /></label>
      <label>Actual amount<input type="number" min="0" step="any" value={v.actual} onChange={(e) => setV({ ...v, actual: e.target.value })} placeholder="when known" /></label>
      <label>Currency<input type="text" maxLength={3} value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value.toUpperCase() })} /></label>
      <label>Start<input type="date" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} /></label><label>End<input type="date" value={v.endDate} onChange={(e) => setV({ ...v, endDate: e.target.value })} /></label></div>
      <label>Notes<textarea rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></label>
      <div className="btns"><button type="button" className="btn primary" disabled={!v.name.trim() || !v.sowId} onClick={save}>Save expense</button><button type="button" className="btn ghost" onClick={() => setEdit(null)}>Cancel</button></div></section>}
    <section className="panel"><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Type</th><th>Expense</th><th>SOW</th><th>Client</th><th>Calculation</th><th className="n">Planned</th><th className="n">Actual</th><th>Dates</th><th /></tr></thead>
      <tbody>{shown.map((e) => <tr key={e.id} className={e.active ? "" : "muted"}><td>{ETYPE[e.type]}</td><td><b>{e.name}</b></td><td>{sowOf(e.sowId)?.sowNumber || sowOf(e.sowId)?.title || "—"}</td><td>{coOf(e.sowId)?.name || "—"}</td>
        <td>{e.calc === "monthly" ? "Monthly" : "One-time"}</td><td className="n num">{money(e.planned, e.currency)}</td><td className="n num">{e.actual != null ? money(e.actual, e.currency) : "—"}</td><td>{fmt(e.startDate)} → {e.endDate ? fmt(e.endDate) : "open"}</td>
        <td className="n">{perms.write && <><button type="button" className="linkbtn small" onClick={() => open(e)}>Edit</button>
          <button type="button" className="linkbtn small" onClick={() => run(() => api(`/api/sow-expenses/${e.id}`, { method: "PATCH", json: { active: !e.active } }), e.active ? "Switched off" : "Switched on")}>{e.active ? "Switch off" : "Switch on"}</button>
          <button type="button" className="linkbtn small" style={{ color: "var(--muted)" }} onClick={() => { if (confirm(`Delete ${e.name}?`)) run(() => api(`/api/sow-expenses/${e.id}`, { method: "DELETE" }), "Deleted"); }}>Delete</button></>}</td></tr>)}
        {!shown.length && <tr><td colSpan={9} className="muted">No expenses here. Add what it costs to deliver each SOW to see its profit.</td></tr>}</tbody></table></div></section></div>;
}
