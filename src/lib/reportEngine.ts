import type { Bootstrap } from "./types";
import { inRange, periodRange, type PeriodKey } from "@/components/periods";

/**
 * The reporting engine: count or add up something, grouped one way, filtered. It works on the same per-person
 * data the app shows (so reports respect access rules), and runs in the browser and on the server alike.
 */
export type Measure = "leads" | "deals" | "pipeline" | "won" | "activities" | "emails" | "calls" | "meetings" | "received" | "tasks";
export type GroupBy = "owner" | "stage" | "month" | "quarter" | "year" | "event" | "product" | "company" | "team" | "source" | "type" | "none";
export type Chart = "bar" | "line" | "donut" | "table";
export type ReportDef = { measure: Measure; groupBy: GroupBy; chart: Chart; period: PeriodKey; from?: string; to?: string; owner?: string; team?: string; product?: string; event?: string };
export type ReportResult = { rows: { key: string; label: string; value: number; count: number }[]; total: number; count: number; money: boolean; title: string; periodLabel: string };

export const MEASURES: [Measure, string, boolean][] = [["leads", "New leads", false], ["deals", "Deals created", false], ["pipeline", "Open pipeline value", true], ["won", "Won value", true],
  ["received", "Money received", true], ["activities", "All activity", false], ["emails", "Emails sent", false], ["calls", "Calls", false], ["meetings", "Meetings", false], ["tasks", "Tasks created", false]];
export const GROUPS: [GroupBy, string][] = [["none", "Nothing (one total)"], ["owner", "Person"], ["stage", "Stage"], ["month", "Month"], ["quarter", "Quarter"], ["year", "Year"],
  ["event", "Event"], ["product", "Product"], ["company", "Company"], ["team", "Team"], ["source", "Source"], ["type", "Activity type"]];
/** Which groupings make sense for each measure. */
export function groupsFor(m: Measure): GroupBy[] {
  const time: GroupBy[] = ["month", "quarter", "year"];
  if (m === "leads") return ["none", "owner", "stage", ...time, "event", "product", "company", "team", "source"];
  if (m === "deals" || m === "pipeline" || m === "won") return ["none", "owner", "stage", ...time, "product", "company", "team"];
  if (m === "received") return ["none", "owner", ...time, "company", "product"];
  if (m === "tasks") return ["none", "owner", ...time];
  return ["none", "owner", "type", ...time, "event", "company"];
}

const STAGE: Record<string, string> = { new: "New lead", contacted: "Contacted", engaged: "Engaged", meeting: "Meeting set", proposal: "Proposal sent", won: "Won", lost: "Not now",
  qualify: "Qualify", negotiation: "Negotiation" };
const TYPE: Record<string, string> = { email: "Email sent", reply: "Reply received", call: "Call", meeting: "Meeting", note: "Note", request: "Request", file: "File" };
const iso = (t: number) => new Date(t).toLocaleDateString("en-CA");
const bucket = (d: string, by: "month" | "quarter" | "year"): [string, string] => {
  const [y, mo] = d.split("-").map(Number);
  if (by === "year") return [`${y}`, `${y}`];
  if (by === "quarter") { const q = Math.floor((mo - 1) / 3) + 1; return [`${y}-Q${q}`, `Q${q} ${y}`]; }
  return [`${y}-${String(mo).padStart(2, "0")}`, new Date(y, mo - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" })];
};

export function runReport(b: Bootstrap, def: ReportDef, meId: string): ReportResult {
  const range = periodRange(def.period, { from: def.from || "", to: def.to || "" });
  const user = (id: string | null | undefined) => (id ? b.users.find((u) => u.id === id)?.name || b.users.find((u) => u.id === id)?.email || "Someone" : "Unassigned");
  const co = (id: string | null | undefined) => (id ? b.companies.find((c) => c.id === id)?.name || "Company" : "No company");
  const contact = new Map(b.contacts.map((c) => [c.id, c]));
  const ownerOk = (id: string | null | undefined) => !def.owner || (def.owner === "mine" ? id === meId : def.owner === "none" ? !id : id === def.owner);
  type Item = { date: string; value: number; owner: string | null; stage?: string; event?: string | null; products: string[]; company?: string | null; team?: string | null; source?: string; type?: string };
  let items: Item[] = []; let money = false;
  const m = def.measure;
  if (m === "leads") items = b.contacts.map((c) => ({ date: iso(c.createdAt), value: 1, owner: c.ownerId, stage: c.status, event: c.eventId, products: c.productIds, company: c.companyId, team: c.teamId, source: c.source || "Unknown" }));
  else if (m === "deals" || m === "pipeline" || m === "won") {
    money = m !== "deals";
    items = b.deals.filter((d) => m === "deals" || (m === "won" ? d.stage === "won" : d.stage !== "won" && d.stage !== "lost"))
      .map((d) => ({ date: m === "deals" ? iso(d.createdAt) : d.closeDate || iso(d.createdAt), value: m === "deals" ? 1 : (d.baseValue ?? d.value), owner: d.ownerId, stage: d.stage, products: d.productId ? [d.productId] : [], company: d.companyId, team: d.teamId,
        event: d.contactId ? contact.get(d.contactId)?.eventId : null }));
  } else if (m === "received") {
    money = true;
    items = b.payments.filter((p) => p.status === "received").map((p) => { const d = b.deals.find((x) => x.id === p.dealId);
      return { date: p.date, value: (() => { const fx = b.config.fx; const c = (d?.currency || fx?.base || "USD").toUpperCase(); return !fx || c === fx.base || !fx.rates[c] ? p.amount : p.amount / fx.rates[c]; })(), owner: d?.ownerId ?? p.createdById, products: d?.productId ? [d.productId] : [], company: d?.companyId, team: d?.teamId }; });
  } else if (m === "tasks") items = b.tasks.map((t) => ({ date: iso(t.createdAt), value: 1, owner: t.assigneeId, products: [] }));
  else {
    const types = m === "emails" ? ["email"] : m === "calls" ? ["call"] : m === "meetings" ? ["meeting"] : null;
    items = b.activities.filter((a) => !a.preview && (!types || types.includes(a.type))).map((a) => { const c = contact.get(a.contactId);
      return { date: iso(a.at), value: 1, owner: a.byId, type: a.type, event: c?.eventId, company: c?.companyId, products: c?.productIds || [], team: c?.teamId }; });
  }
  items = items.filter((i) => inRange(i.date, range) && ownerOk(i.owner) && (!def.team || i.team === def.team) && (!def.product || i.products.includes(def.product)) && (!def.event || i.event === def.event));
  const groups = new Map<string, { label: string; value: number; count: number }>();
  const add = (k: string, label: string, v: number) => { const g = groups.get(k) || { label, value: 0, count: 0 }; g.value += v; g.count++; groups.set(k, g); };
  for (const i of items) {
    switch (def.groupBy) {
      case "owner": add(i.owner || "none", user(i.owner), i.value); break;
      case "stage": add(i.stage || "none", STAGE[i.stage || ""] || "Unknown", i.value); break;
      case "month": case "quarter": case "year": { const [k, l] = bucket(i.date, def.groupBy); add(k, l, i.value); break; }
      case "event": add(i.event || "none", i.event ? b.events.find((e) => e.id === i.event)?.name || "Event" : "No event", i.value); break;
      case "product": if (i.products.length) for (const p of i.products) add(p, b.products.find((x) => x.id === p)?.name || "Product", i.value); else add("none", "No product", i.value); break;
      case "company": add(i.company || "none", co(i.company), i.value); break;
      case "team": add(i.team || "none", i.team ? b.teams.find((t) => t.id === i.team)?.name || "Team" : "No team", i.value); break;
      case "source": add(i.source || "Unknown", i.source || "Unknown", i.value); break;
      case "type": add(i.type || "other", TYPE[i.type || ""] || "Other", i.value); break;
      default: add("all", "Total", i.value);
    }
  }
  const timeline = def.groupBy === "month" || def.groupBy === "quarter" || def.groupBy === "year";
  let rows = [...groups.entries()].map(([key, g]) => ({ key, ...g }));
  rows = timeline ? rows.sort((a, b) => a.key.localeCompare(b.key)) : rows.sort((a, b) => b.value - a.value);
  if (!timeline && rows.length > 15) { const rest = rows.slice(14); rows = [...rows.slice(0, 14), { key: "other", label: `${rest.length} others`, value: rest.reduce((n, r) => n + r.value, 0), count: rest.reduce((n, r) => n + r.count, 0) }]; }
  const title = `${MEASURES.find((x) => x[0] === m)?.[1]}${def.groupBy !== "none" ? ` by ${GROUPS.find((g) => g[0] === def.groupBy)?.[1].toLowerCase()}` : ""}`;
  const periodLabel = range ? `${range[0]} to ${range[1]}` : "All time";
  return { rows, total: items.reduce((n, i) => n + i.value, 0), count: items.length, money, title, periodLabel };
}
