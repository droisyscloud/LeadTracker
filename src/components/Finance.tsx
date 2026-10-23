"use client";
import { AiFold, FoldBtn } from "@/components/AiFold";
import { useMemo, useState } from "react";
import type { BillingDTO, FollowupDTO, SowDTO, SowExpenseDTO } from "@/lib/types";
import { api, useData } from "./data";
import { money, toBaseC, todayStr, userName } from "./model";
import { inRange, periodRange, PERIODS, type PeriodKey } from "./periods";
import { SOW_TYPE } from "./Billing";
import { dueOf, promiseState } from "./Collections";

/* Finance: a receivables dashboard and ready-made finance reports, from what the app already tracks. */
const MONTH = (d: string) => new Date(`${d.slice(0, 7)}-01T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const addMonths = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const daysLate = (d: string | null) => (d ? Math.floor((Date.now() - new Date(`${d}T12:00:00`).getTime()) / 86400_000) : 0);
const invoicedOn = (b: BillingDTO) => b.invoicedOn || (b.status === "paid" ? b.paidOn : null);
const isInvoice = (b: BillingDTO) => b.kind === "invoice" && (b.status === "invoiced" || b.status === "paid");
const FMONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function useFin() {
  const { m } = useData();
  const deal = (id: string) => m.deals.find((d) => d.id === id);
  const sowOf = (b: BillingDTO) => (b.sowId ? m.sows.find((s) => s.id === b.sowId) : undefined);
  const companyOf = (b: BillingDTO) => { const d = deal(b.dealId); return d?.companyId ? m.companies.find((c) => c.id === d.companyId) : undefined; };
  const cur = (b: BillingDTO) => sowOf(b)?.currency || deal(b.dealId)?.currency || "USD";
  return { m, deal, sowOf, companyOf, cur };
}
function csv(name: string, rows: (string | number | null | undefined)[][]) {
  const text = rows.map((r) => r.map((c) => { const s = c == null ? "" : String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); a.download = `${name}-${todayStr()}.csv`; a.click(); URL.revokeObjectURL(a.href);
}
function printPdf() { document.body.classList.add("print-fin"); window.print(); setTimeout(() => document.body.classList.remove("print-fin"), 500); }
function Bars({ rows, two }: { rows: { label: string; a: number; b?: number; tone?: string }[]; two?: [string, string] }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.a, r.b || 0)));
  return <div className="fin-bars">{two && <div className="fin-legend"><span><i className="fa" />{two[0]}</span><span><i className="fb" />{two[1]}</span></div>}
    {rows.map((r) => <div key={r.label} className="fin-row"><span className="fin-lab">{r.label}</span><div className="fin-track">
      <div className={"fin-bar fa" + (r.tone ? " " + r.tone : "")} style={{ width: `${(r.a / max) * 100}%` }} title={money(r.a)} />{r.b !== undefined && <div className="fin-bar fb" style={{ width: `${(r.b / max) * 100}%` }} title={money(r.b)} />}</div>
      <span className="fin-val num">{money(r.a)}{r.b !== undefined ? <> · <span className="muted">{money(r.b)}</span></> : null}</span></div>)}
    {!rows.length && <p className="muted small">Nothing yet.</p>}</div>;
}
function Kpis({ list }: { list: [string, string, string, string][] }) {
  return <div className="kpis">{list.map(([l, v, s, c]) => <div key={l} className="panel kpi" style={{ ["--k" as string]: c }}><div className="lab">{l}</div><span className="val">{v}</span><div className="sub">{s}</div></div>)}</div>;
}

export function FinanceView() {
  const [sub, setSub] = useState<"dash" | "reports">("dash");
  return <div className="dir fin">
    <div className="vt fin-noprint" role="tablist" aria-label="Finance"><button type="button" role="tab" aria-pressed={sub === "dash"} aria-selected={sub === "dash"} onClick={() => setSub("dash")}><span>Dashboard</span></button>
      <button type="button" role="tab" aria-pressed={sub === "reports"} aria-selected={sub === "reports"} onClick={() => setSub("reports")}><span>Reports</span></button></div>
    {sub === "dash" ? <Dashboard /> : <Reports />}
  </div>;
}

function Dashboard() {
  const F = useFin(); const { m, run, perms } = useData(); const t = todayStr();
  const [period, setPeriod] = useState<PeriodKey>("this-year"); const [co, setCo] = useState("all"); const [outlook, setOutlook] = useState(""); const [busy, setBusy] = useState(false);
  const range = periodRange(period);
  const all = m.billing.filter((b) => co === "all" || F.companyOf(b)?.id === co);
  const inv = all.filter((b) => isInvoice(b) && inRange(invoicedOn(b), range)); const paid = all.filter((b) => b.status === "paid" && inRange(b.paidOn, range));
  const open = all.filter((b) => b.kind === "invoice" && b.status === "invoiced"); const overdue = open.filter((b) => (dueOf(b) || "9") < t);
  const sum = (x: BillingDTO[]) => x.reduce((n, b) => n + toBaseC(m, b.amount, F.cur(b)), 0);
  const rate = sum(inv) ? Math.round((sum(paid.filter((b) => inRange(invoicedOn(b), range))) / sum(inv)) * 100) : null;
  const thisM = t.slice(0, 7); const months = [-5, -4, -3, -2, -1, 0].map((n) => addMonths(thisM, n));
  const monthly = months.map((ym) => ({ label: MONTH(ym), a: sum(all.filter((b) => isInvoice(b) && (invoicedOn(b) || "").startsWith(ym))), b: sum(all.filter((b) => b.status === "paid" && (b.paidOn || "").startsWith(ym))) }));
  const ahead = [0, 1, 2, 3, 4, 5].map((n) => addMonths(thisM, n));
  const forecast = [{ label: "Overdue", a: sum(overdue), tone: "late" }, ...ahead.map((ym) => ({ label: MONTH(ym), a: sum(open.filter((b) => (dueOf(b) || "").startsWith(ym) && (dueOf(b) || "") >= t)) }))];
  const fs = m.config.fiscalStart || 1; const now = new Date(); const fyStartY = now.getMonth() + 1 >= fs ? now.getFullYear() : now.getFullYear() - 1;
  const fyStart = `${fyStartY}-${String(fs).padStart(2, "0")}-01`; const fyEnd = new Date(fyStartY + 1, fs - 1, 0).toLocaleDateString("en-CA");
  const fyInv = sum(all.filter((b) => isInvoice(b) && inRange(invoicedOn(b), [fyStart, fyEnd]))); const fyPaid = sum(all.filter((b) => b.status === "paid" && inRange(b.paidOn, [fyStart, fyEnd])));
  const fyOpen = sum(open.filter((b) => (dueOf(b) || "9") <= fyEnd)); const fySched = sum(all.filter((b) => b.kind === "invoice" && (b.status === "scheduled" || b.status === "requested") && (b.dueDate || "9") <= fyEnd));
  const aging = [["Not yet due", (d: number) => d <= 0], ["1–30 days", (d: number) => d >= 1 && d <= 30], ["31–60 days", (d: number) => d >= 31 && d <= 60], ["61–90 days", (d: number) => d >= 61 && d <= 90], ["90+ days", (d: number) => d > 90]] as [string, (d: number) => boolean][];
  const agingRows = aging.map(([label, f], i) => ({ label, a: sum(open.filter((b) => f(daysLate(dueOf(b))))), tone: i >= 3 ? "late" : i >= 1 ? "warn" : "" }));
  const byCo = new Map<string, number>(); for (const b of open) { const c = F.companyOf(b)?.name || "No company"; byCo.set(c, (byCo.get(c) || 0) + b.amount); }
  const top = [...byCo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, a]) => ({ label, a }));
  const byType = new Map<string, number>(); for (const b of inv) { const k = SOW_TYPE[F.sowOf(b)?.sowType || ""] || "No SOW type"; byType.set(k, (byType.get(k) || 0) + b.amount); }
  const types = [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([label, a]) => ({ label, a }));
  const fus = (m.followups || []) as FollowupDTO[];
  const broken = fus.filter((f) => promiseState(f, m.billing.find((b) => b.id === f.billingItemId)) === "broken").length;
  const companies = [...new Map(m.billing.map((b) => F.companyOf(b)).filter(Boolean).map((c) => [c!.id, c!])).values()];
  const ask = async () => { setBusy(true); const r = await run(() => api<{ text: string }>("/api/ai/finance-outlook", { json: { facts: { today: t, invoicedInPeriod: sum(inv), collectedInPeriod: sum(paid), outstanding: sum(open), overdue: sum(overdue), overdueInvoices: overdue.length,
    aging: Object.fromEntries(agingRows.map((r) => [r.label, r.a])), dueByMonth: Object.fromEntries(forecast.map((r) => [r.label, r.a])), topOutstanding: Object.fromEntries(top.map((r) => [r.label, r.a])), brokenPromises: broken,
    pendingPromises: fus.filter((f) => promiseState(f, m.billing.find((b) => b.id === f.billingItemId)) === "pending").map((f) => ({ amount: f.promiseAmount, by: f.promiseDate })) } } })); setBusy(false); if (r) setOutlook(r.text); };
  return <div className="fin-print">
    <div className="fin-head"><div className="quick fin-noprint" role="group" aria-label="Period">{PERIODS.filter(([k]) => k !== "custom").map(([k, l]) => <button key={k} type="button" className="chip" aria-pressed={period === k} onClick={() => setPeriod(k)}>{l}</button>)}</div>
      <div className="fin-tools fin-noprint"><select aria-label="Client" value={co} onChange={(e) => setCo(e.target.value)}><option value="all">All clients</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <button type="button" className="btn" onClick={printPdf}>Export PDF</button></div>
      <p className="small muted">Generated {new Date().toLocaleDateString([], { dateStyle: "medium" })} · {PERIODS.find(([k]) => k === period)?.[1]} · {co === "all" ? "All clients" : companies.find((c) => c.id === co)?.name}</p></div>
    <Kpis list={[["Invoiced", money(sum(inv)), `${inv.length} invoices in this period`, "var(--blue)"], ["Collected", money(sum(paid)), `${paid.length} payments received`, "var(--k-call)"],
      ["Outstanding", money(sum(open)), `${open.length} unpaid invoices`, "var(--mild)"], ["Overdue", money(sum(overdue)), `${overdue.length} past due${broken ? ` · ${broken} broken promise${broken === 1 ? "" : "s"}` : ""}`, "var(--cold)"],
      ["Collection rate", rate == null ? "—" : `${rate}%`, "of this period's invoices are paid", "var(--violet)"]]} />
    {m.config.ai && <AiFold id="fin-cash-outlook" title="Cash outlook"><section className="panel fin-ai"><div className="fin-ai-h"><b>✨ Cash outlook</b><button type="button" className="btn sm fin-noprint" disabled={busy} onClick={ask}>{busy ? "Thinking…" : outlook ? "Refresh" : "Ask AI"}</button><FoldBtn /></div>
      {outlook ? <p className="fin-ai-t">{outlook}</p> : <p className="small muted">A few lines on what's coming in, what's at risk and who to chase first.</p>}</section></AiFold>}
    <div className="fin-grid">
      <section className="panel"><h3>Invoiced vs collected, last 6 months</h3><Bars rows={monthly} two={["Invoiced", "Collected"]} /></section>
      <section className="panel"><h3>Payment forecast</h3><p className="small muted">Unpaid invoices by the month they're due: what's expected in, not a statistical guess.</p><Bars rows={forecast} /></section>
      <section className="panel fin-wide"><h3>Financial year forecast <span className="small muted">FY {fyStart.slice(0, 4)}{fs !== 1 ? `–${String(fyStartY + 1).slice(2)}` : ""} ({fyStart} to {fyEnd})</span></h3>
        <div className="fin-fy"><div><small>Invoiced so far</small><b className="num">{money(fyInv)}</b></div><div><small>Collected so far</small><b className="num">{money(fyPaid)}</b></div>
          <div><small>Unpaid, due before year end</small><b className="num">{money(fyOpen)}</b></div><div><small>Still to invoice before year end</small><b className="num">{money(fySched)}</b></div>
          <div className="fin-fy-total"><small>Expected collected by year end</small><b className="num">{money(fyPaid + fyOpen)}</b><span className="small muted">plus up to {money(fySched)} if scheduled invoices go out and are paid in time</span></div></div>
        {perms.admin && <label className="small fin-noprint fin-fs">Financial year starts in <select value={fs} onChange={(e) => run(() => api("/api/settings/finance", { method: "PATCH", json: { fiscalStart: Number(e.target.value) } }), "Saved")}>{FMONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select></label>}</section>
      <section className="panel"><h3>Accounts receivable aging</h3><Bars rows={agingRows} /></section>
      <section className="panel"><h3>Top outstanding customers</h3><Bars rows={top} /></section>
      <section className="panel"><h3>Revenue by SOW type</h3><p className="small muted">Invoiced in this period.</p><Bars rows={types} /></section>
    </div>
  </div>;
}

type Rep = "invoices" | "ar" | "profit" | "expenses" | "followups";
function Reports() {
  const F = useFin(); const { m } = useData(); const t = todayStr();
  const [rep, setRep] = useState<Rep>("invoices"); const [period, setPeriod] = useState<PeriodKey>("this-year");
  const [co, setCo] = useState("all"); const [sowF, setSowF] = useState("all"); const [type, setType] = useState("all"); const [status, setStatus] = useState("all"); const [currency, setCurrency] = useState("all");
  const range = periodRange(period);
  const sowOk = (s?: SowDTO) => (sowF === "all" || s?.id === sowF) && (type === "all" || s?.sowType === type);
  const items = m.billing.filter((b) => b.kind === "invoice" && (co === "all" || F.companyOf(b)?.id === co) && sowOk(F.sowOf(b)) && (currency === "all" || F.cur(b) === currency));
  const companies = [...new Map(m.billing.map((b) => F.companyOf(b)).filter(Boolean).map((c) => [c!.id, c!])).values()];
  const currencies = [...new Set(m.billing.map((b) => F.cur(b)))];
  const sum = (x: BillingDTO[]) => x.reduce((n, b) => n + toBaseC(m, b.amount, F.cur(b)), 0);
  const view = useMemo(() => {
    if (rep === "invoices") {
      const rows = items.filter((b) => (b.status !== "scheduled" && b.status !== "cancelled") && inRange(invoicedOn(b) || b.dueDate, range) && (status === "all" || b.status === status || (status === "overdue" && b.status === "invoiced" && (dueOf(b) || "9") < t)));
      const invd = rows.filter(isInvoice); const pd = rows.filter((b) => b.status === "paid"); const op = rows.filter((b) => b.status === "invoiced"); const od = op.filter((b) => (dueOf(b) || "9") < t);
      return { kpis: [["Total invoiced", money(sum(invd)), `${invd.length} invoices`, "var(--blue)"], ["Total paid", money(sum(pd)), `${pd.length} invoices`, "var(--k-call)"], ["Outstanding", money(sum(op)), `${op.length} invoices`, "var(--mild)"],
          ["Overdue", money(sum(od)), `${od.length} invoices`, "var(--cold)"], ["Collection rate", sum(invd) ? `${Math.round((sum(pd) / sum(invd)) * 100)}%` : "—", "paid ÷ invoiced", "var(--violet)"]] as [string, string, string, string][],
        head: ["Invoice", "Client", "SOW", "Invoice no.", "Invoiced", "Due", "Status", "Paid on", "Amount"],
        rows: rows.map((b) => [b.label, F.companyOf(b)?.name || "", F.sowOf(b)?.sowNumber || F.sowOf(b)?.title || "", b.invoiceNumber, invoicedOn(b) || "", dueOf(b) || "", b.status === "invoiced" && (dueOf(b) || "9") < t ? "overdue" : b.status, b.paidOn || "", money(b.amount, F.cur(b))]) };
    }
    if (rep === "ar") {
      const rows = items.filter((b) => b.status === "invoiced").sort((a, b) => (dueOf(a) || "").localeCompare(dueOf(b) || ""));
      const bucket = (d: number) => (d <= 0 ? "Not yet due" : d <= 30 ? "1–30" : d <= 60 ? "31–60" : d <= 90 ? "61–90" : "90+");
      const od = rows.filter((b) => daysLate(dueOf(b)) > 0);
      return { kpis: [["Outstanding", money(sum(rows)), `${rows.length} invoices`, "var(--mild)"], ["Overdue", money(sum(od)), `${od.length} invoices`, "var(--cold)"], ["Over 60 days", money(sum(rows.filter((b) => daysLate(dueOf(b)) > 60))), "seriously late", "var(--cold)"]] as [string, string, string, string][],
        head: ["Invoice", "Client", "Invoice no.", "Due", "Days late", "Aging", "Last follow-up", "Promise", "Amount"],
        rows: rows.map((b) => { const fu = ((m.followups || []) as FollowupDTO[]).filter((f) => f.billingItemId === b.id).sort((x, y) => y.dueDate.localeCompare(x.dueDate)); const pr = fu.find((f) => f.promiseDate);
          return [b.label, F.companyOf(b)?.name || "", b.invoiceNumber, dueOf(b) || "", Math.max(0, daysLate(dueOf(b))), bucket(daysLate(dueOf(b))), fu[0] ? `${fu[0].dueDate} ${fu[0].outcome || fu[0].status}` : "none", pr ? `${pr.promiseDate} (${promiseState(pr, b)})` : "", money(b.amount, F.cur(b))]; }) };
    }
    if (rep === "profit") {
      const sows = m.sows.filter((s) => sowOk(s) && (co === "all" || F.deal(s.dealId)?.companyId === co) && (currency === "all" || s.currency === currency));
      const rows = sows.map((s) => { const lines = m.billing.filter((b) => b.sowId === s.id && b.kind === "invoice"); const ex = ((m.sowExpenses || []) as SowExpenseDTO[]).filter((e) => e.sowId === s.id && e.active);
        const months = (e: SowExpenseDTO) => (e.calc === "monthly" ? Math.max(1, Math.round(((e.endDate ? new Date(`${e.endDate}T12:00:00`) : new Date(`${s.endDate || t}T12:00:00`)).getTime() - new Date(`${e.startDate || s.startDate || t}T12:00:00`).getTime()) / (30.4 * 86400_000))) : 1);
        const planned = ex.reduce((n, e) => n + e.planned * months(e), 0); const actual = ex.reduce((n, e) => n + (e.actual ?? 0) * (e.actual != null ? months(e) : 0), 0);
        const invd = sum(lines.filter(isInvoice)); const coll = sum(lines.filter((b) => b.status === "paid")); const cost = actual || planned; const profit = (s.value || invd) - cost;
        return { s, invd, coll, planned, actual, profit, margin: (s.value || invd) ? Math.round((profit / (s.value || invd)) * 100) : null }; });
      const tv = rows.reduce((n, r) => n + (r.s.value || 0), 0), tp = rows.reduce((n, r) => n + r.profit, 0);
      return { kpis: [["Contract value", money(tv), `${rows.length} SOWs`, "var(--blue)"], ["Expected profit", money(tp), "value − costs (actual, or planned when no actual yet)", "var(--k-call)"], ["Average margin", tv ? `${Math.round((tp / tv) * 100)}%` : "—", "across these SOWs", "var(--violet)"]] as [string, string, string, string][],
        head: ["SOW", "Client", "Type", "Value", "Invoiced", "Collected", "Planned cost", "Actual cost", "Profit", "Margin"],
        rows: rows.map((r) => [`${r.s.sowNumber ? r.s.sowNumber + " · " : ""}${r.s.title}`, m.companies.find((c) => c.id === F.deal(r.s.dealId)?.companyId)?.name || "", SOW_TYPE[r.s.sowType] || "", money(r.s.value || 0, r.s.currency), money(r.invd, r.s.currency), money(r.coll, r.s.currency), money(r.planned, r.s.currency), r.actual ? money(r.actual, r.s.currency) : "—", money(r.profit, r.s.currency), r.margin == null ? "—" : `${r.margin}%`]) };
    }
    if (rep === "expenses") {
      const ex = ((m.sowExpenses || []) as SowExpenseDTO[]).filter((e) => { const s = m.sows.find((x) => x.id === e.sowId); return sowOk(s) && (co === "all" || F.deal(s?.dealId || "")?.companyId === co) && (currency === "all" || e.currency === currency) && (!range || inRange(e.startDate, range) || !e.startDate); });
      return { kpis: [["Planned", money(ex.reduce((n, e) => n + e.planned, 0)), `${ex.length} expenses`, "var(--blue)"], ["Actual so far", money(ex.reduce((n, e) => n + (e.actual || 0), 0)), `${ex.filter((e) => e.actual != null).length} with actuals`, "var(--mild)"]] as [string, string, string, string][],
        head: ["Expense", "Type", "SOW", "Client", "Calculation", "Planned", "Actual", "Start", "End", "Status"],
        rows: ex.map((e) => { const s = m.sows.find((x) => x.id === e.sowId); return [e.name, e.type, s?.sowNumber || s?.title || "", m.companies.find((c) => c.id === F.deal(s?.dealId || "")?.companyId)?.name || "", e.calc === "monthly" ? "Monthly" : "One-time", money(e.planned, e.currency), e.actual != null ? money(e.actual, e.currency) : "—", e.startDate || "", e.endDate || "", e.active ? "Active" : "Inactive"]; }) };
    }
    const fus = ((m.followups || []) as FollowupDTO[]).filter((f) => { const b = m.billing.find((x) => x.id === f.billingItemId); return b && items.includes(b) && inRange(f.dueDate, range); });
    const done = fus.filter((f) => f.status === "done");
    return { kpis: [["Follow-ups", String(fus.length), `${done.length} done`, "var(--blue)"], ["Promises", String(fus.filter((f) => f.promiseDate).length), `${fus.filter((f) => promiseState(f, m.billing.find((b) => b.id === f.billingItemId)) === "kept").length} kept`, "var(--k-call)"],
        ["Broken promises", String(fus.filter((f) => promiseState(f, m.billing.find((b) => b.id === f.billingItemId)) === "broken").length), "need a firmer chase", "var(--cold)"]] as [string, string, string, string][],
      head: ["Date", "Invoice", "Client", "Assigned to", "Type", "Priority", "Status", "Outcome", "Promise", "Notes"],
      rows: fus.sort((a, b) => b.dueDate.localeCompare(a.dueDate)).map((f) => { const b = m.billing.find((x) => x.id === f.billingItemId)!; return [f.dueDate, b.label, F.companyOf(b)?.name || "", f.assigneeId ? userName(m, f.assigneeId) : "", f.type, f.priority, f.status, f.outcome, f.promiseDate ? `${f.promiseAmount ?? ""} by ${f.promiseDate} (${promiseState(f, b)})` : "", f.notes]; }) };
  }, [m, rep, period, co, sowF, type, status, currency]); // eslint-disable-line react-hooks/exhaustive-deps
  const NAMES: Record<Rep, string> = { invoices: "Invoice & collection", ar: "Accounts receivable / overdue", profit: "SOW profitability", expenses: "Expenses", followups: "Collection follow-ups" };
  return <div className="fin-print">
    <div className="vt fin-noprint" role="tablist" aria-label="Report">{(Object.keys(NAMES) as Rep[]).map((k) => <button key={k} type="button" role="tab" aria-pressed={rep === k} aria-selected={rep === k} onClick={() => setRep(k)}><span>{NAMES[k]}</span></button>)}</div>
    <div className="fin-head"><div><b>{NAMES[rep]} report</b><p className="small muted">Generated {new Date().toLocaleDateString([], { dateStyle: "medium" })} · {PERIODS.find(([k]) => k === period)?.[1]}{co !== "all" ? ` · ${companies.find((c) => c.id === co)?.name}` : ""}</p></div>
      <div className="fin-tools fin-noprint"><button type="button" className="btn" onClick={() => csv(NAMES[rep].toLowerCase().replace(/[^a-z]+/g, "-"), [view.head, ...view.rows])}>Export CSV</button><button type="button" className="btn" onClick={printPdf}>Export PDF</button></div></div>
    <div className="bill-filters fin-noprint">
      <select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)}>{PERIODS.filter(([k]) => k !== "custom").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <select aria-label="Client" value={co} onChange={(e) => setCo(e.target.value)}><option value="all">All clients</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select aria-label="SOW" value={sowF} onChange={(e) => setSowF(e.target.value)}><option value="all">All SOWs</option>{m.sows.map((s) => <option key={s.id} value={s.id}>{s.sowNumber || s.title}</option>)}</select>
      <select aria-label="SOW type" value={type} onChange={(e) => setType(e.target.value)}><option value="all">Any SOW type</option>{Object.entries(SOW_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      {rep === "invoices" && <select aria-label="Invoice status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Any status</option><option value="requested">Requested</option><option value="invoiced">Awaiting payment</option><option value="overdue">Overdue</option><option value="paid">Paid</option></select>}
      {currencies.length > 1 && <select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}><option value="all">Any currency</option>{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</select>}</div>
    <Kpis list={view.kpis} />
    <section className="panel"><div className="tbl-wrap"><table className="tbl"><thead><tr>{view.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{view.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}{!view.rows.length && <tr><td colSpan={view.head.length} className="muted">Nothing for these filters.</td></tr>}</tbody></table></div></section>
  </div>;
}
