"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { api, useData } from "./data";
import { DEAL_STAGES, STAGES, userName, type Model } from "./model";
import { Icon } from "./ui";

type Row = { id: string; action: string; entity?: string; entityId?: string | null; actorId: string | null; at: number; detail: Record<string, unknown> | null };
const when = (t: number) => new Date(t).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const money = (v: unknown, cur?: unknown) => (typeof v === "number" ? `${cur || "USD"} ${v.toLocaleString()}` : String(v ?? "nothing"));
const FIELD: Record<string, string> = { name: "name", value: "value", currency: "currency", stage: "stage", probability: "probability", closeDate: "close date", ownerId: "owner", teamId: "team",
  companyId: "company", contactId: "lead", productId: "product", outcomeReason: "reason", status: "stage", rating: "rating" };
function val(m: Model, field: string, v: unknown, d?: Record<string, unknown>) {
  if (v === null || v === undefined || v === "") return "nothing";
  if (field === "ownerId") return userName(m, String(v));
  if (field === "teamId") return m.teams.find((t) => t.id === v)?.name || "a team";
  if (field === "companyId") return m.companyMap.get(String(v))?.name || "a company";
  if (field === "contactId") return m.contactMap.get(String(v))?.name || "a lead";
  if (field === "productId") return m.productMap.get(String(v))?.name || "a product";
  if (field === "stage") return DEAL_STAGES.find((s) => s[0] === v)?.[1] || String(v);
  if (field === "status") return STAGES.find((s) => s[0] === v)?.[1] || String(v);
  if (field === "value") return money(v, d?.currency);
  if (field === "probability") return `${v}%`;
  if (field === "rating") return `${v}★`;
  return String(v);
}
/** A plain-language sentence for one audit entry. */
export function describe(m: Model, r: Row): string {
  const d = r.detail || {}; const name = String(d.name || d.label || ""); const ch = (Array.isArray(d.changes) ? d.changes : []) as { field: string; from: unknown; to: unknown }[];
  const changes = ch.map((c) => `${FIELD[c.field] || c.field} from ${val(m, c.field, c.from, d)} to ${val(m, c.field, c.to, d)}`).join("; ");
  const map: Record<string, string> = {
    "followup.created": `added a payment follow-up (due ${String(d.due || "")})`, "followup.updated": `updated a payment follow-up${d.outcome ? ` (${String(d.outcome).replace("_", " ")})` : ""}`, "followup.deleted": "deleted a payment follow-up",
    "project.created": `created the project ${name || ""}`.trim(), "project.updated": "updated a project", "project.deleted": `deleted the project ${name || ""}`.trim(),
    "sow.expense.created": `added the SOW expense ${name || ""}`.trim(), "sow.expense.updated": "updated a SOW expense", "sow.expense.deleted": "deleted a SOW expense",
    "accounting.connected": "connected QuickBooks", "accounting.disconnected": "disconnected QuickBooks", "accounting.imported": `imported invoices from ${String(d.file || "a file")}`, "accounting.linked": `linked accounting invoice ${String(d.docNumber || "")}`,
    "target.set": `set a ${String(d.period || "")} target`, "target.removed": "removed a target", "email.shared": "shared an email with the team", "email.unshared": "stopped sharing an email", "settings.finance": "changed the financial year start",
    "deal.created": `created the deal ${name} (${money(d.value)})`, "deal.updated": `changed ${name}: ${changes}`, "deal.deleted": `deleted the deal ${name}`,
    "contact.updated": `changed the lead ${name}: ${changes}`, "contact.deleted": `deleted the lead ${name}`, "contact.merged": "merged two leads", "contact.imported": `imported ${d.count ?? "some"} leads`,
    "contact.reassigned": "reassigned leads", "contact.resubscribed": "recorded that a lead asked to hear from us again",
    "company.created": `added the company ${name}`, "company.updated": `updated the company ${name}`, "company.merged": "merged two companies", "company.deleted": `deleted the company ${name}`,
    "activity.edited": "edited a timeline entry", "activity.deleted": "deleted a timeline entry",
    "payment.added": `recorded a payment of ${money(d.amount)} (${d.status || "received"}, ${d.date || ""})`, "payment.deleted": `deleted a payment of ${money(d.amount)}`,
    "payment.received": `marked a payment of ${money(d.amount)} as received`, "payment.updated": `changed a payment (${money(d.amount)})`,
    "sow.attached": `attached the SOW ${d.file || ""}`, "billing.requested": `asked accounts to invoice ${d.label || ""}`, "billing.invoiced": `marked ${d.label || "an invoice"} as invoiced`,
    "billing.paid": `marked ${d.label || "an invoice"} as paid`, "billing.cancelled": `closed ${d.label || "a billing line"}`, "billing.scheduled": `moved ${d.label || "a billing line"} back to scheduled`,
    "user.updated": "changed a user's role or access", "invite.created": `invited ${d.email || "someone"}`, "invite.revoked": `cancelled an invitation${d.email ? ` for ${d.email}` : ""}`,
    "team.created": `created the team ${name}`, "team.updated": `updated the team ${name}`, "team.deleted": `deleted the team ${name}`,
    "product.created": `added the product ${name}`, "product.updated": `updated the product ${name}`, "product.deleted": `deleted the product ${name}`,
    "template.created": "added an email template", "template.updated": "changed an email template", "template.deleted": "deleted an email template",
    "sequence.deleted": "deleted a sequence", "event.deleted": "deleted an event", "export.csv": "exported everything to a spreadsheet", "backup.run": "ran a backup to Google Drive",
    "settings.chat": "changed the Google Chat settings", "settings.billing": "changed the accounts team for billing", "settings.backup": "changed the backup settings", "settings.address": "changed the postal address for emails",
    "trash.restored": `restored ${name || "an item"} from the recycle bin`, "trash.purged": `deleted ${name || "an item"} forever`,
  };
  return map[r.action] || r.action.replace(/[._]/g, " ");
}

/** History on a deal: every change, newest first. */
export function DealHistory({ dealId }: { dealId: string }) {
  const { m } = useData();
  const { data } = useSWR<{ items: Row[] }>(`/api/deals/${dealId}/history`, (u: string) => api<{ items: Row[] }>(u));
  const [all, setAll] = useState(false);
  if (!data) return null;
  const items = all ? data.items : data.items.slice(0, 6);
  return <div className="dhist"><h3 className="section-h" style={{ margin: 0 }}>History</h3>
    {data.items.length ? <ol className="hist">{items.map((r) => <li key={r.id}><span className="h-when">{when(r.at)}</span><span><b>{r.actorId ? userName(m, r.actorId) : "The system"}</b> {describe(m, r)}</span></li>)}</ol>
      : <p className="small muted" style={{ margin: 0 }}>No changes recorded yet. From now on, every change to this deal is listed here.</p>}
    {data.items.length > 6 && <button className="linkbtn small" onClick={() => setAll(!all)}>{all ? "Show less" : `Show all ${data.items.length}`}</button>}
  </div>;
}

const GROUPS: [string, string][] = [["", "Everything"], ["deal", "Deals"], ["contact", "Leads"], ["company", "Companies"], ["activity", "Timeline"], ["payment", "Payments"], ["billing", "Billing"], ["sow", "Contracts"],
  ["user", "Users and access"], ["invite", "Invitations"], ["team", "Teams"], ["settings", "Settings"], ["export", "Exports"], ["trash", "Recycle bin"], ["followup", "Collections"], ["accounting", "Accounting"], ["target", "Targets"]];
/** Audit history (admins): who did what and when. */
export function AuditView() {
  const { m, perms } = useData();
  const [f, setF] = useState({ actor: "", group: "", from: "", to: "", q: "" });
  const [rows, setRows] = useState<Row[]>([]); const [more, setMore] = useState(false); const [busy, setBusy] = useState(false);
  const qs = (before?: number) => new URLSearchParams(Object.entries({ ...f, ...(before ? { before: String(before) } : {}) }).filter(([, v]) => v)).toString();
  const load = async (append = false) => { setBusy(true); try { const r = await api<{ items: Row[]; more: boolean }>(`/api/admin/audit?${qs(append ? rows[rows.length - 1]?.at : undefined)}`); setRows(append ? [...rows, ...r.items] : r.items); setMore(r.more); } finally { setBusy(false); } };
  useEffect(() => { if (perms.admin) { const t = setTimeout(() => load(), f.q ? 300 : 0); return () => clearTimeout(t); } }, [f.actor, f.group, f.from, f.to, f.q]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!perms.admin) return <p className="empty">Only admins can see the audit history.</p>;
  const link = (r: Row) => r.entity === "deal" && r.entityId && m.deals.some((d) => d.id === r.entityId) ? `/deals?id=${r.entityId}` : r.entity === "contact" && r.entityId && m.contactMap.get(r.entityId) ? `/contacts?id=${r.entityId}` : r.entity === "company" && r.entityId && m.companyMap.get(r.entityId) ? `/companies?id=${r.entityId}` : null;
  return <div className="dir">
    <div className="dir-head"><div className="dir-count"><b className="num">Audit</b><span>who changed what, and when</span></div></div>
    <div className="dir-filters">
      <label>Person<select value={f.actor} onChange={(e) => setF({ ...f, actor: e.target.value })}><option value="">Everyone</option>{m.users.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}</select></label>
      <label>What<select value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })}>{GROUPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label>From<input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
      <label>To<input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
      <label>Search<input type="search" value={f.q} placeholder="Name, email or word" onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
    </div>
    <section className="panel">{rows.length ? <ol className="hist audit">{rows.map((r) => { const l = link(r); return <li key={r.id}><span className="h-when">{when(r.at)}</span>
      <span><b>{r.actorId ? userName(m, r.actorId) : "The system"}</b> {describe(m, r)}{l && <> · <Link className="colink" href={l}>Open</Link></>}</span></li>; })}</ol>
      : <p className="empty">{busy ? "Loading…" : "Nothing matches."}</p>}
      {more && <div className="dir-more"><button className="btn" disabled={busy} onClick={() => load(true)}>Load more</button></div>}</section>
  </div>;
}

type Bin = { id: string; kind: "contact" | "deal" | "activity" | "company"; entityId: string; label: string; detail: string; deletedById: string | null; deletedAt: number; purgeAt: number; files: number };
const KIND: Record<Bin["kind"], [string, string]> = { contact: ["Lead", "contacts"], deal: ["Deal", "deals"], activity: ["Timeline entry", "note"], company: ["Company", "companies"] };
/** The recycle bin: restore anything deleted in the last 30 days. */
export function TrashView() {
  const { m, run, perms } = useData();
  const { data, mutate } = useSWR<{ items: Bin[] }>("/api/trash", (u: string) => api<{ items: Bin[] }>(u));
  const [kind, setKind] = useState("");
  const items = (data?.items || []).filter((i) => !kind || i.kind === kind);
  const restore = async (i: Bin) => { if (await run(() => api(`/api/trash/${i.id}/restore`, { json: {} }), `${i.label} restored`)) mutate(); };
  const purge = async (i: Bin) => { if (!confirm(`Delete "${i.label}" forever? This can't be undone${i.files ? `, and its ${i.files} file${i.files === 1 ? "" : "s"} will be removed` : ""}.`)) return; if (await run(() => api(`/api/trash/${i.id}`, { method: "DELETE" }), "Deleted forever")) mutate(); };
  const open = (i: Bin) => i.kind === "contact" ? `/contacts?id=${i.entityId}` : i.kind === "deal" ? `/deals?id=${i.entityId}` : i.kind === "company" ? `/companies?id=${i.entityId}` : null;
  return <div className="dir">
    <div className="dir-head"><div className="dir-count"><b className="num">{data?.items.length ?? "…"}</b><span>in the recycle bin</span></div>
      <div className="dir-tools"><span className="small muted">{perms.manage ? "Everything deleted in the last 30 days." : "What you deleted in the last 30 days."} After 30 days items are removed for good.</span></div></div>
    <div className="quick" role="group" aria-label="Show">{[["", "All"], ["contact", "Leads"], ["deal", "Deals"], ["activity", "Timeline entries"], ["company", "Companies"]].map(([k, l]) =>
      <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{l} <span className="n">{(data?.items || []).filter((i) => !k || i.kind === k).length}</span></button>)}</div>
    <section className="panel">{!data ? <p className="empty">Loading…</p> : items.length ? <ul className="bin">{items.map((i) => { const left = Math.max(0, Math.ceil((i.purgeAt - Date.now()) / 86400_000));
      return <li key={i.id}><span className="bin-ic"><Icon name={KIND[i.kind][1]} size={16} /></span>
        <span className="bin-main"><span className="kbadge">{KIND[i.kind][0]}</span> <b>{i.label}</b>{i.detail && <span className="small muted"> · {i.detail}</span>}
          <span className="small muted bin-meta">Deleted {when(i.deletedAt)}{i.deletedById ? ` by ${userName(m, i.deletedById)}` : ""}{i.files ? ` · ${i.files} file${i.files === 1 ? "" : "s"}` : ""} · <span className={left <= 3 ? "late" : ""}>{left} day{left === 1 ? "" : "s"} left</span></span></span>
        <span className="bin-act"><button className="btn sm primary" onClick={() => restore(i)}>Restore</button><button className="btn sm ghost danger-t" onClick={() => purge(i)}>Delete forever</button></span>
      </li>; })}</ul> : <p className="empty">Nothing here. Deleted leads, deals, timeline entries and companies wait here for 30 days, so you can restore them.</p>}</section>
    {data && items.some((i) => open(i)) && <p className="small muted">Restored items come back exactly as they were, with their timeline, files and links.</p>}
  </div>;
}
