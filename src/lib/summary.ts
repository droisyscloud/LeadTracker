import { createHash } from "crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { complete } from "./llm";
import { db, schema } from "@/db";
import { aiConfigured } from "./config";
import { HttpError } from "./http";
import { canReadEmail, redactEmail } from "./emailPrivacy";
import { getFx, toBase } from "./fx";
import { company, who } from "./brand";

export type Scope = "dashboard" | "team" | "contact" | "company";
export type Summary = { headline: string; points: string[]; risks: string[]; actions: string[]; generatedAt: number; cached: boolean; stale: boolean };

const STAGE: Record<string, string> = { new: "New lead", contacted: "Contacted", engaged: "Engaged", meeting: "Meeting set", proposal: "Proposal sent", won: "Won", lost: "Not now" };
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "never");
const daysAgo = (d: Date | null | undefined) => (d ? Math.floor((Date.now() - d.getTime()) / 86400_000) : null);
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

async function names() {
  const us = await db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email }).from(schema.users);
  const m = new Map(us.map((u) => [u.id, u.name || u.email]));
  return (id: string | null | undefined) => (id ? m.get(id) || "former teammate" : "unassigned");
}

export async function contactContext(id: string, viewerId: string | null = null) {
  const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, id)).limit(1);
  if (!c) throw new HttpError(404, "Lead not found.");
  const who = await names();
  const [co] = c.companyId ? await db.select().from(schema.companies).where(eq(schema.companies.id, c.companyId)).limit(1) : [];
  const prods = await db.select({ name: schema.products.name }).from(schema.contactProducts).innerJoin(schema.products, eq(schema.products.id, schema.contactProducts.productId)).where(eq(schema.contactProducts.contactId, id));
  const acts = (await db.select().from(schema.activities).where(eq(schema.activities.contactId, id)).orderBy(desc(schema.activities.at)).limit(20)).map((a) => (canReadEmail(a, viewerId) ? a : redactEmail(a)));
  const deals = await db.select().from(schema.deals).where(eq(schema.deals.contactId, id));
  const tasks = (await db.select().from(schema.tasks).where(eq(schema.tasks.contactId, id))).filter((t) => !t.done);
  const enr = await db.select().from(schema.enrollments).where(eq(schema.enrollments.contactId, id));
  const [team] = c.teamId ? await db.select().from(schema.teams).where(eq(schema.teams.id, c.teamId)).limit(1) : [];
  return { kind: "a single sales lead", data: {
    lead: { name: c.name, title: c.title, linkedin: c.linkedinUrl || undefined, professionalBackground: c.background || undefined, company: co?.name, companyWebsite: co?.website, companyDescription: co?.description, stage: STAGE[c.status], owner: who(c.ownerId), team: team?.name,
      rating: c.rating, tags: c.tags, products: prods.map((p) => p.name), source: c.source, introducedBy: c.referredBy, nextFollowUp: c.nextFollowUp, lastTouchDaysAgo: daysAgo(c.lastTouchAt), outcome: c.outcomeReason },
    deals: deals.map((d) => ({ name: d.name, value: d.value, currency: d.currency, stage: d.stage, probability: d.probability, closeDate: d.closeDate })),
    openTasks: tasks.map((t) => ({ title: t.title, due: t.dueDate, assignee: who(t.assigneeId) })),
    sequences: enr.map((e) => ({ status: e.status, step: e.step + 1, stoppedReason: e.stoppedReason })),
    history: acts.map((a) => ({ date: day(a.at), type: a.type, by: who(a.byId), subject: a.subject, outcome: a.outcome, kind: a.kind, opened: !!a.openedAt, text: cut(a.body, 300) })),
  } };
}

async function companyContext(id: string, viewerId: string | null = null) {
  const [co] = await db.select().from(schema.companies).where(eq(schema.companies.id, id)).limit(1);
  if (!co) throw new HttpError(404, "Company not found.");
  const who = await names();
  const people = (await db.select().from(schema.contacts).where(eq(schema.contacts.companyId, id))).filter((x) => !x.personal || (!!viewerId && x.createdById === viewerId));
  const ids = people.map((p) => p.id);
  const acts = (ids.length ? await db.select().from(schema.activities).where(inArray(schema.activities.contactId, ids)).orderBy(desc(schema.activities.at)).limit(30) : []).map((a) => (canReadEmail(a, viewerId) ? a : redactEmail(a)));
  const deals = await db.select().from(schema.deals).where(eq(schema.deals.companyId, id));
  const byId = new Map(people.map((p) => [p.id, p.name]));
  return { kind: "one company (account) and everyone we know there", data: {
    company: { name: co.name, website: co.website, industry: co.industry, location: co.location, employees: co.employees, description: co.description, notes: cut(co.notes, 500) },
    people: people.map((p) => ({ name: p.name, title: p.title, stage: STAGE[p.status], owner: who(p.ownerId), lastTouchDaysAgo: daysAgo(p.lastTouchAt), tags: p.tags })),
    deals: deals.map((d) => ({ name: d.name, value: d.value, currency: d.currency, stage: d.stage, probability: d.probability, closeDate: d.closeDate, owner: who(d.ownerId) })),
    recentActivity: acts.map((a) => ({ date: day(a.at), person: byId.get(a.contactId), type: a.type, by: who(a.byId), subject: a.subject, text: cut(a.body, 200) })),
  } };
}

async function pipelineContext(teamId: string | null, visible: Set<string> | null = null, viewerId: string | null = null) {
  const FX = await getFx();
  const who = await names();
  const [team] = teamId ? await db.select().from(schema.teams).where(eq(schema.teams.id, teamId)).limit(1) : [];
  if (teamId && !team) throw new HttpError(404, "Team not found.");
  const members = team ? (await db.select().from(schema.teamMembers).where(eq(schema.teamMembers.teamId, team.id))).map((x) => x.userId) : null;
  let contacts = (await db.select().from(schema.contacts)).filter((x) => !x.personal || (!!viewerId && x.createdById === viewerId));
  if (visible) contacts = contacts.filter((c) => visible.has(c.id));
  if (team) contacts = contacts.filter((c) => c.teamId === team.id);
  const ids = new Set(contacts.map((c) => c.id));
  const acts = (await db.select().from(schema.activities).orderBy(desc(schema.activities.at)).limit(4000)).filter((a) => ids.has(a.contactId)).map((a) => (canReadEmail(a, viewerId) ? a : redactEmail(a)));
  let deals = await db.select().from(schema.deals);
  if (team) deals = deals.filter((d) => d.teamId === team.id || (!!d.contactId && ids.has(d.contactId)));
  let tasks = (await db.select().from(schema.tasks)).filter((t) => !t.done);
  if (team) tasks = tasks.filter((t) => (t.contactId && ids.has(t.contactId)) || (!!t.assigneeId && members!.includes(t.assigneeId)));
  const cos = new Map((await db.select().from(schema.companies)).map((c) => [c.id, c.name]));
  const byContact = new Map<string, typeof acts>(); for (const a of acts) byContact.set(a.contactId, [...(byContact.get(a.contactId) || []), a]);
  const outbound = (cid: string) => (byContact.get(cid) || []).some((a) => ["email", "call", "meeting"].includes(a.type));
  const wk = Date.now() - 7 * 86400_000, today = new Date().toISOString().slice(0, 10);
  const open = contacts.filter((c) => c.status !== "won" && c.status !== "lost");
  const stageCounts = Object.fromEntries(Object.keys(STAGE).map((k) => [STAGE[k], contacts.filter((c) => c.status === k).length]));
  const emailed = contacts.filter((c) => (byContact.get(c.id) || []).some((a) => a.type === "email"));
  const replied = emailed.filter((c) => (byContact.get(c.id) || []).some((a) => a.type === "reply"));
  const openDeals = deals.filter((d) => d.stage !== "won" && d.stage !== "lost");
  const perPerson = new Map<string, { emails: number; calls: number; meetings: number; last7: number }>();
  for (const a of acts) { if (!a.byId) continue; const p = perPerson.get(a.byId) || { emails: 0, calls: 0, meetings: 0, last7: 0 };
    if (a.type === "email") p.emails++; if (a.type === "call") p.calls++; if (a.type === "meeting") p.meetings++; if (a.at.getTime() >= wk) p.last7++; perPerson.set(a.byId, p); }
  return { kind: team ? `the "${team.name}" sales team${team.description ? ` (${team.description})` : ""}` : "the whole sales pipeline", data: {
    today, team: team ? { name: team.name, lead: who(team.leadId), target: team.target, members: members!.map(who) } : undefined,
    totals: { leads: contacts.length, openLeads: open.length, neverContacted: open.filter((c) => !outbound(c.id)).length, contacted: contacts.filter((c) => outbound(c.id)).length,
      leadsEmailed: emailed.length, leadsReplied: replied.length, activitiesLast7Days: acts.filter((a) => a.byId && a.at.getTime() >= wk).length,
      openPipelineValue: openDeals.reduce((n, d) => n + toBase(d.value, d.currency, FX), 0), weightedPipeline: Math.round(openDeals.reduce((n, d) => n + (toBase(d.value, d.currency, FX) * d.probability) / 100, 0)),
      wonValue: deals.filter((d) => d.stage === "won").reduce((n, d) => n + toBase(d.value, d.currency, FX), 0), overdueTasks: tasks.filter((t) => t.dueDate && t.dueDate < today).length },
    stageCounts,
    biggestOpenDeals: openDeals.sort((a, b) => b.value - a.value).slice(0, 10).map((d) => ({ name: d.name, company: d.companyId ? cos.get(d.companyId) : null, value: d.value, stage: d.stage, probability: d.probability, closeDate: d.closeDate, owner: who(d.ownerId), overdueClose: !!d.closeDate && d.closeDate < today })),
    goingCold: open.filter((c) => outbound(c.id) && c.lastTouchAt && daysAgo(c.lastTouchAt)! >= 5).sort((a, b) => a.lastTouchAt!.getTime() - b.lastTouchAt!.getTime()).slice(0, 10)
      .map((c) => ({ name: c.name, company: c.companyId ? cos.get(c.companyId) : null, stage: STAGE[c.status], owner: who(c.ownerId), daysSinceTouch: daysAgo(c.lastTouchAt) })),
    recentReplies: acts.filter((a) => a.type === "reply").slice(0, 8).map((a) => { const c = contacts.find((x) => x.id === a.contactId); return { date: day(a.at), lead: c?.name, company: c?.companyId ? cos.get(c.companyId) : null, text: cut(a.body, 200) }; }),
    overdueTaskList: tasks.filter((t) => t.dueDate && t.dueDate < today).slice(0, 8).map((t) => ({ title: t.title, due: t.dueDate, assignee: who(t.assigneeId) })),
    people: [...perPerson.entries()].filter(([id]) => !members || members.includes(id)).map(([id, p]) => ({ name: who(id), ...p })),
    lossReasons: deals.filter((d) => d.stage === "lost" && d.outcomeReason).map((d) => d.outcomeReason),
  } };
}

const FORMAT = `Return only JSON: {"headline": "one sentence, the single most important thing", "points": ["3 to 5 short factual observations"], "risks": ["0 to 3 risks or things slipping"], "actions": ["2 to 4 specific next steps, naming the person or lead where possible"]}`;

export async function summarize(scope: Scope, id: string | null, userId: string, force: boolean, peek = false, visible: Set<string> | null = null): Promise<Summary | null> {
  if (!aiConfigured()) throw new HttpError(501, "AI is not configured on this server. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.");
  const ctx = scope === "contact" ? await contactContext(id!, userId) : scope === "company" ? await companyContext(id!, userId) : await pipelineContext(scope === "team" ? id : null, scope === "dashboard" ? visible : null, userId);
  const json = JSON.stringify(ctx.data);
  const hash = createHash("sha256").update(json).digest("hex");
  // each person's own dashboard summary when they only see part of the pipeline
  const key = `${scope}:${id || (visible ? `user:${userId}` : "all")}:for:${userId}`;
  const [hit] = await db.select().from(schema.aiSummaries).where(eq(schema.aiSummaries.key, key)).limit(1);
  const fresh = hit && hit.dataHash === hash && Date.now() - hit.createdAt.getTime() < 24 * 3600_000;
  if (peek) return hit ? { ...(hit.content as Omit<Summary, "generatedAt" | "cached" | "stale">), generatedAt: hit.createdAt.getTime(), cached: true, stale: !fresh } : null;
  if (hit && fresh && !force) return { ...(hit.content as Omit<Summary, "generatedAt" | "cached" | "stale">), generatedAt: hit.createdAt.getTime(), cached: true, stale: false };
  const us = await company();
  const prompt = `You are a sharp, practical sales operations analyst at ${who(us)}. Summarise ${ctx.kind} for a busy sales manager.

Rules: use only the data below and never invent facts, names, numbers or dates. Be concrete: name leads, companies, people, amounts and dates from the data. Keep every item under 30 words. Plain language, no em dashes, no markdown. If there is too little data, say so plainly and suggest what to log.

Data (JSON):
${json}

${FORMAT}`;
  const t = await complete({ prompt, maxTokens: 900 });
  let j: Partial<Summary>;
  try { j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); } catch { throw new HttpError(502, "The AI summary could not be read. Try again."); }
  const clean = (a: unknown) => (Array.isArray(a) ? a.map((x) => String(x).replace(/\u2014/g, ", ")).filter(Boolean).slice(0, 6) : []);
  const content = { headline: String(j.headline || "").replace(/\u2014/g, ", "), points: clean(j.points), risks: clean(j.risks), actions: clean(j.actions) };
  await db.insert(schema.aiSummaries).values({ key, content, dataHash: hash, createdById: userId, createdAt: new Date() })
    .onConflictDoUpdate({ target: schema.aiSummaries.key, set: { content, dataHash: hash, createdById: userId, createdAt: new Date() } });
  return { ...content, generatedAt: Date.now(), cached: false, stale: false };
}
