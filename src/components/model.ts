import type { ActivityDTO, ActivityType, Bootstrap, CompanyDTO, ContactDTO, DealDTO, DealStage, EventDTO, Role, SequenceDTO, Stage, TaskDTO, UserDTO } from "@/lib/types";

export const DAY = 86400000;
export const STAGES: [Stage, string, string][] = [
  ["new", "New lead", "#93A3BC"], ["contacted", "Contacted", "#4C8DF0"], ["engaged", "Engaged", "#9B8CFF"],
  ["meeting", "Meeting set", "#3DDC97"], ["proposal", "Proposal sent", "#38D6E8"], ["won", "Won", "#1F8A5B"], ["lost", "Not now", "#FF7A59"],
];
export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s[0], s[1]])) as Record<Stage, string>;
export const STAGE_RANK = Object.fromEntries(STAGES.map((s, i) => [s[0], i])) as Record<Stage, number>;
export const TAGS = ["Immediate follow-up", "Schedule meeting", "Send price list", "Send product brochure", "Set up trial", "Unlikely"];
export const TYPES: Record<ActivityType, { icon: string; label: string }> = {
  email: { icon: "✉", label: "Email" }, reply: { icon: "↩", label: "Reply received" }, call: { icon: "☎", label: "Call" },
  meeting: { icon: "◷", label: "Meeting" }, request: { icon: "★", label: "Request received" }, note: { icon: "✎", label: "Note" }, file: { icon: "⎘", label: "File" },
};
export const CALL_OUT: Record<string, string> = { connected: "Connected", voicemail: "Left voicemail", no_answer: "No answer" };
export const REQ_KINDS = ["Price list", "Product brochure", "Demo", "Trial", "Proposal", "Meeting", "Other"];
export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", manager: "Manager", rep: "Sales rep", viewer: "Viewer" };
export const ROLE_CAN: Record<Role, string[]> = {
  admin: ["Sees and changes everything", "Invites people, sets roles and teams, disables access", "Sees the audit log"],
  manager: ["Sees everything in their teams: the team's leads, members' leads, deals and tasks", "Sees unassigned leads and hands them out", "Reassigns, merges, deletes and exports within their teams", "Manages their own teams, products and events"],
  rep: ["Sees only leads they own, plus leads shared with them through a task or an @mention", "Adds leads, scans badges, logs calls, emails and notes on their own leads", "No access to team pages or other reps' leads"],
  viewer: ["Sees only leads assigned to them (and shared with them)", "Can comment and reply when mentioned", "Can't change anything"],
};
const RANK: Record<Role, number> = { viewer: 0, rep: 1, manager: 2, admin: 3 };
export const can = (r: Role, min: Role) => RANK[r] >= RANK[min];

export type Stats = { emails: number; sent: number; opened: number; bounced: number; replies: number; calls: number; connected: number; requests: number; openReq: number; meetings: number; notes: number; outbound: number; last: number };

export type Model = Bootstrap & {
  userMap: Map<string, UserDTO>; companyMap: Map<string, CompanyDTO>; contactMap: Map<string, ContactDTO>;
  productMap: Map<string, { id: string; name: string; description: string }>;
  stats: Map<string, Stats>; actsByContact: Map<string, ActivityDTO[]>;
  teamMap: Map<string, import("@/lib/types").TeamDTO>; dealMap: Map<string, DealDTO>; eventMap: Map<string, EventDTO>; sequenceMap: Map<string, SequenceDTO>; taskMap: Map<string, TaskDTO>;
};

export function buildModel(b: Bootstrap): Model {
  HIDE_MONEY = b.caps ? !b.caps.money : false; BASE = (b.config.fx?.base || "USD").toUpperCase();
  const stats = new Map<string, Stats>();
  const actsByContact = new Map<string, ActivityDTO[]>();
  for (const a of b.activities) {
    let s = stats.get(a.contactId);
    if (!s) { s = { emails: 0, sent: 0, opened: 0, bounced: 0, replies: 0, calls: 0, connected: 0, requests: 0, openReq: 0, meetings: 0, notes: 0, outbound: 0, last: 0 }; stats.set(a.contactId, s); }
    s.last = Math.max(s.last, a.at);
    if (a.type === "email") { s.emails++; s.outbound++; if (a.delivery === "sent") s.sent++; if (a.openedAt) s.opened++; if (a.bounced) s.bounced++; }
    else if (a.type === "reply") s.replies++;
    else if (a.type === "call") { s.calls++; s.outbound++; if (a.outcome === "connected") s.connected++; }
    else if (a.type === "request") { s.requests++; if (!a.done) s.openReq++; }
    else if (a.type === "meeting") { s.meetings++; s.outbound++; }
    else if (a.type === "note") s.notes++;
    const l = actsByContact.get(a.contactId) || []; l.push(a); actsByContact.set(a.contactId, l);
  }
  return {
    ...b, stats, actsByContact,
    userMap: new Map(b.users.map((u) => [u.id, u])), companyMap: new Map(b.companies.map((c) => [c.id, c])),
    contactMap: new Map(b.contacts.map((c) => [c.id, c])), productMap: new Map(b.products.map((p) => [p.id, p])),
    teamMap: new Map(b.teams.map((t) => [t.id, t])), dealMap: new Map(b.deals.map((d) => [d.id, d])), eventMap: new Map(b.events.map((e) => [e.id, e])),
    sequenceMap: new Map(b.sequences.map((q) => [q.id, q])), taskMap: new Map(b.tasks.map((t) => [t.id, t])),
  };
}

export const todayStr = () => new Date().toLocaleDateString("en-CA");
export function ago(ms: number | null | undefined) {
  if (!ms) return "never";
  const d = (Date.now() - ms) / 1000;
  if (d < 60) return "just now"; if (d < 3600) return Math.floor(d / 60) + "m ago"; if (d < 86400) return Math.floor(d / 3600) + "h ago";
  const days = Math.floor(d / 86400); return days < 30 ? days + "d ago" : new Date(ms).toLocaleDateString();
}
export const initials = (n: string | null | undefined) => (n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
export const firstName = (n: string) => (n || "").trim().split(/\s+/)[0] || "there";
export function fmtPhone(p: string) {
  const d = String(p).replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === "1") return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return (String(p).startsWith("+") ? "" : "+") + d;
}
export const webHref = (w: string) => (/^https?:\/\//i.test(w) ? w : "https://" + w);
export const webLabel = (w: string) => w.replace(/^https?:\/\//i, "").replace(/\/$/, "");

export const userName = (m: Model, id: string | null | undefined) => {
  if (!id) return "Unassigned"; if (id === m.me.id) return "You";
  const u = m.userMap.get(id); return u ? u.name || u.email : "Former teammate";
};
export const coName = (m: Model, c: ContactDTO) => (c.companyId ? m.companyMap.get(c.companyId)?.name || "" : "");
export const prodNames = (m: Model, c: ContactDTO) => c.productIds.map((id) => m.productMap.get(id)?.name).filter(Boolean) as string[];
export const lastTouch = (m: Model, c: ContactDTO) => Math.max(c.lastTouchAt || 0, m.stats.get(c.id)?.last || 0) || c.createdAt;
export const daysSince = (m: Model, c: ContactDTO) => Math.floor((Date.now() - lastTouch(m, c)) / DAY);
export const isOpen = (c: ContactDTO) => c.status !== "won" && c.status !== "lost";
/** dismissed from Follow-ups, unless a later follow-up date has been set since */
export const followDismissed = (c: ContactDTO) => !!c.followupDismissedOn && (!c.nextFollowUp || c.nextFollowUp <= c.followupDismissedOn);
export function isDue(m: Model, c: ContactDTO) {
  if (!isOpen(c) || followDismissed(c)) return false;
  if (c.nextFollowUp && c.nextFollowUp <= todayStr()) return true;
  return !(m.stats.get(c.id)?.outbound);
}
export function dueReason(m: Model, c: ContactDTO) {
  if (c.nextFollowUp && c.nextFollowUp < todayStr()) return "Overdue since " + c.nextFollowUp;
  if (c.nextFollowUp === todayStr()) return "Due today";
  if (!m.stats.get(c.id)?.outbound) return "Not contacted yet";
  return "";
}
export function heatColor(m: Model, c: ContactDTO) {
  if (c.status === "won") return "var(--warm)"; if (c.status === "lost") return "var(--line)";
  const d = daysSince(m, c); return d <= 2 ? "var(--warm)" : d <= 6 ? "var(--mild)" : "var(--cold)";
}
export function companyKey(name: string) {
  const k = String(name || "").toLowerCase().replace(/&|\band\b/g, "").replace(/[^a-z0-9]/g, "").replace(/(gmbh|ltd|limited|inc|llc|corp|corporation|co)$/, "");
  return k || "unknown";
}

export const TEMPLATES: Record<string, { name: string; subject: string; body: string }> = {
  thanks: { name: "Thanks for visiting", subject: "Great meeting you at our booth, {first}", body: "Hi {first},\n\nThank you for stopping by our booth. It was great to hear what {company} is working on.\n\nI'd like to keep the conversation going. Would you have 30 minutes next week for a short call so we can look at where we could help your team?\n\nBest regards,\n{me}\n{mycompany}" },
  brochure: { name: "Send brochure", subject: "{mycompany} overview for {company}", body: "Hi {first},\n\nThanks again for your time at the booth. As promised, I've attached our product overview.\n\nIf you let me know which areas matter most for {company}, I can put together a focused walkthrough for your team.\n\nBest regards,\n{me}\n{mycompany}" },
  pricing: { name: "Send price list", subject: "Pricing information, as discussed", body: "Hi {first},\n\nFollowing up on our conversation at the booth, please find our pricing information attached.\n\nPricing depends on scope, so I'm happy to walk through options that fit {company}. Would a short call this week or next work for you?\n\nBest regards,\n{me}\n{mycompany}" },
  meeting: { name: "Schedule a meeting", subject: "Finding time to continue our conversation", body: "Hi {first},\n\nIt was good to connect at the booth. Could we set up a 30 minute call to go deeper on what {company} needs?\n\nA few times that work on my side:\n- \n- \n- \n\nIf none of those suit you, send over a time that does and I'll make it work.\n\nBest regards,\n{me}\n{mycompany}" },
  bump: { name: "Second follow-up", subject: "Quick follow-up, {first}", body: "Hi {first},\n\nI wanted to follow up on my earlier note in case it got buried after the show. Is exploring this still a priority for {company} this quarter?\n\nHappy to send a short summary instead of a call if that's easier.\n\nBest regards,\n{me}\n{mycompany}" },
  blank: { name: "Blank", subject: "", body: "" },
};
export const PLACEHOLDERS: [string, string][] = [["{first}", "First name"], ["{name}", "Full name"], ["{title}", "Job title"], ["{company}", "Company"], ["{product}", "Products they're interested in"], ["{event}", "Event where you met"], ["{me}", "Your name"], ["{mycompany}", "Your company"], ["{mycompany}", "Your company"], ["{myemail}", "Your email"], ["{booking_link}", "Your booking page link"]];
export function fillTemplate(t: string, m: Model, c: ContactDTO) {
  const products = c.productIds.map((id) => m.productMap.get(id)?.name).filter(Boolean).join(" and ");
  const ev = c.eventId ? m.eventMap.get(c.eventId)?.name : "";
  return t.replaceAll("{first}", firstName(c.name)).replaceAll("{name}", c.name).replaceAll("{title}", c.title || "").replaceAll("{company}", coName(m, c) || "your team")
    .replaceAll("{product}", products || "our solutions").replaceAll("{event}", ev || "the event").replaceAll("{me}", m.me.name || "").replaceAll("{mycompany}", m.config.brand.companyName).replaceAll("{mycompany}", m.config.brand.companyName).replaceAll("{myemail}", m.me.email).replaceAll("{booking_link}", m.booking?.enabled ? m.booking.url : "");
}

export const SOURCES = ["Booth", "Website form", "LinkedIn", "Introduction", "Referral", "Cold outreach", "Inbound call", "Partner", "Email", "Other"];
export const WIN_REASONS = ["Product fit", "Price", "Relationship", "Timing", "Support and service", "Other"];
export const LOSS_REASONS = ["Price", "Went with a competitor", "No budget", "No decision", "Timing", "Not a fit", "Unresponsive", "Other"];
export const DEAL_STAGES: [DealStage, string, string][] = [["qualify", "Qualify", "#93A3BC"], ["proposal", "Proposal", "#4C8DF0"], ["negotiation", "Negotiation", "#9B8CFF"], ["won", "Won", "#3DDC97"], ["lost", "Lost", "#FF7A59"]];
export const DEAL_LABEL = Object.fromEntries(DEAL_STAGES.map((s) => [s[0], s[1]])) as Record<DealStage, string>;
export const isOpenDeal = (d: DealDTO) => d.stage !== "won" && d.stage !== "lost";
/** Money is shown as a dash for roles that may not see deal values (the server sends no amounts to them). */
let HIDE_MONEY = false;
/** Totals are shown in the company's base currency. */
let BASE = "USD";
export const baseCurrency = () => BASE;
const sym = () => { try { return new Intl.NumberFormat("en-US", { style: "currency", currency: BASE }).formatToParts(0).find((p) => p.type === "currency")?.value || "$"; } catch { return "$"; } };
export const moneyHidden = () => HIDE_MONEY;
export const money = (n: number, cur = BASE) => { if (HIDE_MONEY) return "—"; try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n); } catch { return `${cur} ${n.toLocaleString()}`; } };
export const moneyShort = (n: number) => HIDE_MONEY ? "—" : (n >= 1e6 ? `${sym()}${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${sym()}${Math.round(n / 1e3)}k` : `${sym()}${Math.round(n)}`);
export const taskOverdue = (t: TaskDTO) => !t.done && !!t.dueDate && t.dueDate < todayStr();
export const taskDueToday = (t: TaskDTO) => !t.done && t.dueDate === todayStr();

/** A copy of the model limited to one team: its leads, their activity, its deals and its members' tasks. */
export function scopeModel(m: Model, teamId: string | null | undefined): Model {
  if (!teamId) return m;
  const t = m.teamMap.get(teamId); if (!t) return m;
  const contacts = m.contacts.filter((c) => c.teamId === teamId); const ids = new Set(contacts.map((c) => c.id));
  const members = new Set(t.memberIds); const coIds = new Set(contacts.map((c) => c.companyId).filter(Boolean));
  return buildModel({ ...m, contacts, activities: m.activities.filter((a) => ids.has(a.contactId)),
    deals: m.deals.filter((d) => d.teamId === teamId || (!d.teamId && !!d.contactId && ids.has(d.contactId))),
    tasks: m.tasks.filter((x) => (x.contactId && ids.has(x.contactId)) || (!x.contactId && !!x.assigneeId && members.has(x.assigneeId))),
    companies: m.companies.filter((c) => coIds.has(c.id)), products: t.productIds.length ? m.products.filter((p) => t.productIds.includes(p.id)) : m.products,
    enrollments: m.enrollments.filter((e) => ids.has(e.contactId)) });
}
export type TeamMetrics = { leads: number; contacted: number; emails: number; calls: number; connected: number; replies: number; meetings: number; replyRate: number;
  openPipe: number; weighted: number; won: number; winRate: number; overdueTasks: number; acts7: number; untouched: number };
export function teamMetrics(m: Model, teamId: string): TeamMetrics {
  const s = scopeModel(m, teamId); let emails = 0, calls = 0, connected = 0, replies = 0, meetings = 0, emailed = 0, replied = 0, contacted = 0;
  for (const c of s.contacts) { const x = s.stats.get(c.id); if (!x) continue; emails += x.emails; calls += x.calls; connected += x.connected; replies += x.replies; meetings += x.meetings;
    if (x.outbound) contacted++; if (x.emails) emailed++; if (x.emails && x.replies) replied++; }
  const open = s.deals.filter(isOpenDeal), closed = s.deals.filter((d) => !isOpenDeal(d)), wonDeals = closed.filter((d) => d.stage === "won");
  const wk = Date.now() - 7 * DAY;
  return { leads: s.contacts.length, contacted, emails, calls, connected, replies, meetings, replyRate: emailed ? Math.round((replied / emailed) * 100) : 0,
    openPipe: open.reduce((n, d) => n + dv(d), 0), weighted: Math.round(open.reduce((n, d) => n + (dv(d) * d.probability) / 100, 0)), won: wonDeals.reduce((n, d) => n + dv(d), 0),
    winRate: closed.length ? Math.round((wonDeals.length / closed.length) * 100) : 0, overdueTasks: s.tasks.filter(taskOverdue).length,
    acts7: s.activities.filter((a) => a.byId && a.at >= wk).length, untouched: s.contacts.filter((c) => !s.stats.get(c.id)?.outbound && isOpen(c)).length };
}

/** A deal's value in the base currency (for totals across deals in different currencies). */
export const dv = (d: { value: number; baseValue?: number }) => d.baseValue ?? d.value;
/** An amount in the base currency, from the rates in the app's data. */
export function toBaseC(m: { config: { fx?: { base: string; rates: Record<string, number> } } }, amount: number, currency: string | null | undefined) {
  const fx = m.config.fx; if (!fx) return amount; const c = (currency || fx.base).toUpperCase(); if (c === fx.base) return amount; const r = fx.rates[c]; return r ? amount / r : amount;
}

/** One calendar meeting is logged on every invited contact's timeline. For agendas and counts, the same organiser +
 *  time + title is ONE meeting; `withIds` lists everyone at it. */
export const meetingKey = (a: { byId: string | null; meetingAt?: number | null; subject?: string | null }) => `${a.byId}|${a.meetingAt}|${(a.subject || "").trim().toLowerCase()}`;
export function uniqueMeetings<T extends { id: string; contactId: string; byId: string | null; meetingAt?: number | null; subject?: string | null }>(list: T[]): (T & { withIds: string[] })[] {
  const seen = new Map<string, T & { withIds: string[] }>();
  for (const a of list) { const k = meetingKey(a); const cur = seen.get(k); if (cur) { if (!cur.withIds.includes(a.contactId)) cur.withIds.push(a.contactId); } else seen.set(k, { ...a, withIds: [a.contactId] }); }
  return [...seen.values()];
}

/** Every lead / company a task is linked to (the main one first). */
export const taskLeadIds = (t: { contactId: string | null; contactIds?: string[] | null }) => [...new Set([t.contactId, ...(t.contactIds || [])].filter(Boolean) as string[])];
export const taskCompanyIds = (t: { companyId: string | null; companyIds?: string[] | null }) => [...new Set([t.companyId, ...(t.companyIds || [])].filter(Boolean) as string[])];

/** "Sun, Oct 18" (with the year when it isn't this year) instead of 2026-10-18. */
export const niceDate = (d: string | null | undefined) => { if (!d) return ""; const x = new Date(`${d}T12:00:00`); if (isNaN(x.getTime())) return d;
  return x.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", ...(x.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) }); };
