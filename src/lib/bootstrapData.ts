import { and, asc, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { appName, company } from "./brand";
import { passwordEnabled } from "./password";
import { db, schema } from "@/db";
import type { requireUser } from "@/lib/session";
import { accessFor } from "@/lib/access";
import { paymentDTO } from "@/lib/payments";
import { billingForDeals } from "@/lib/billing";
import { activityDTO, companyDTO, contactDTO, dealDTO, enrollmentDTO, eventDTO, inviteDTO, sequenceDTO, taskDTO, userDTO } from "@/lib/leads";
import { crmConfigured } from "@/lib/hubspot";
import { aiConfigured, appUrl, mailConfigured, MAX_UPLOAD_BYTES, practiceMode } from "@/lib/config";
import { aiProvider } from "@/lib/llm";
import { canSendMail } from "@/lib/oauth";
import { TASK_MAX_UPLOAD_BYTES } from "@/lib/uploads";
import type { Bootstrap } from "@/lib/types";
import { capsFor } from "./permissions";
import { getState } from "./jobstate";
import { getFx, toBase } from "./fx";
import { canReadEmail, redactEmail } from "./emailPrivacy";

type Me = Awaited<ReturnType<typeof requireUser>>;
/**
 * Everything one person can see, under the same access rules as the app's screens. Used by the app itself
 * and by things that run without anyone signed in (scheduled reports, shared dashboards, digests).
 */
export async function bootstrapFor(me: Me): Promise<Bootstrap> {
  const fx = await getFx();
  const [users, companiesAll, products, contactsAll, cps, actsAll, dealsAll, tasksAll, events, seqs, enrAll, conn, teamsAll, tms, tps] = await Promise.all([
    db.select().from(schema.users),
    db.select().from(schema.companies),
    db.select().from(schema.products),
    db.select().from(schema.contacts),
    db.select().from(schema.contactProducts),
    db.select().from(schema.activities).orderBy(desc(schema.activities.at)).limit(Number(process.env.BOOTSTRAP_ACTIVITY_LIMIT || 5000)),
    db.select().from(schema.deals), db.select().from(schema.tasks), db.select().from(schema.events), db.select().from(schema.sequences), db.select().from(schema.enrollments),
    db.select().from(schema.connections).where(eq(schema.connections.userId, me.id)),
    db.select().from(schema.teams), db.select().from(schema.teamMembers), db.select().from(schema.teamProducts),
  ]);
  // only what this person is allowed to see (see lib/access.ts)
  const acc = await accessFor(me);
  const myDismissed = new Map((await db.select().from(schema.followupDismissals).where(eq(schema.followupDismissals.userId, me.id))).map((x) => [x.contactId, x.dismissedOn]));
  const contacts = contactsAll.filter((c) => acc.canSeeContact(c.id));
  const acts = actsAll.filter((a) => acc.canSeeContact(a.contactId));
  const deals = dealsAll.filter((d) => acc.canSeeDeal(d.id));
  const tasks = tasksAll.filter((t) => acc.canSeeTask(t.id));
  const companies = companiesAll.filter((c) => acc.canSeeCompany(c.id));
  const enr = enrAll.filter((e) => acc.canSeeContact(e.contactId));
  const dealIds = deals.map((d) => d.id);
  const bill = await billingForDeals(dealIds);
  const snoozes = (await db.select().from(schema.actionSnoozes).where(and(eq(schema.actionSnoozes.userId, me.id), gt(schema.actionSnoozes.until, new Date().toLocaleDateString("en-CA")))))
    .map((s) => ({ contactId: s.contactId, signature: s.signature, until: s.until }));
  const payments = dealIds.length ? (await db.select().from(schema.dealPayments).where(inArray(schema.dealPayments.dealId, dealIds))).map(paymentDTO) : [];
  const teams = me.role === "admin" ? teamsAll : me.role === "manager" ? teamsAll.filter((t) => acc.teamIds.has(t.id)) : [];
  const fileRows = acts.length ? await db.select().from(schema.files).where(inArray(schema.files.activityId, acts.map((a) => a.id))) : [];
  const mailRows = acts.length ? await db.select().from(schema.emailAttachments).where(inArray(schema.emailAttachments.activityId, acts.map((a) => a.id))) : [];
  const mailBy = new Map<string, (typeof mailRows)>(); for (const f of mailRows) mailBy.set(f.activityId, [...(mailBy.get(f.activityId) || []), f]);
  const filesBy = new Map<string, (typeof fileRows)>();
  for (const f of fileRows) { if (!f.activityId) continue; const l = filesBy.get(f.activityId) || []; l.push(f); filesBy.set(f.activityId, l); }
  const prodBy = new Map<string, string[]>();
  for (const cp of cps) { const l = prodBy.get(cp.contactId) || []; l.push(cp.productId); prodBy.set(cp.contactId, l); }
  // task extras: who is tagged, how many replies and attachments, and my notifications
  const [watchRows, commentStats, fileStats, notes] = await Promise.all([
    db.select().from(schema.taskWatchers),
    db.select({ taskId: schema.taskComments.taskId, n: sql<number>`count(*) filter (where ${schema.taskComments.kind} = 'comment')`, last: sql<Date>`max(${schema.taskComments.createdAt})` }).from(schema.taskComments).groupBy(schema.taskComments.taskId),
    db.select({ taskId: schema.taskComments.taskId, n: sql<number>`count(${schema.files.id})` }).from(schema.files).innerJoin(schema.taskComments, eq(schema.files.taskCommentId, schema.taskComments.id)).groupBy(schema.taskComments.taskId),
    db.select().from(schema.notifications).where(eq(schema.notifications.userId, me.id)).orderBy(desc(schema.notifications.createdAt)).limit(40),
  ]);
  const [views, myBooking] = await Promise.all([
    db.select().from(schema.savedViews).where(or(eq(schema.savedViews.createdById, me.id), eq(schema.savedViews.shared, true))).orderBy(asc(schema.savedViews.name)),
    db.select().from(schema.bookingPages).where(eq(schema.bookingPages.userId, me.id)).limit(1),
  ]);
  const templates = await db.select().from(schema.emailTemplates).orderBy(asc(schema.emailTemplates.sortOrder), asc(schema.emailTemplates.name));
  const watchBy = new Map<string, string[]>(); for (const w of watchRows) watchBy.set(w.taskId, [...(watchBy.get(w.taskId) || []), w.userId]);
  const cBy = new Map(commentStats.map((c) => [c.taskId, c])); const fBy = new Map(fileStats.map((f) => [f.taskId, Number(f.n)]));
  const invites = me.role === "admin" ? (await db.select().from(schema.invites)).filter((i) => i.status === "pending").map(inviteDTO) : [];
  const data: Bootstrap = {
    me: userDTO(me), canScope: me.role === "admin" || !!me.scopedMine,
    targets: (await db.select().from(schema.targets)).map((t) => ({ ...t, createdAt: t.createdAt.getTime() })),
    users: users.map(userDTO),
    invites,
    companies: companies.map(companyDTO),
    products: products.map((p) => ({ id: p.id, name: p.name, description: p.description })),
    contacts: contacts.map((c) => ({ ...contactDTO(c, prodBy.get(c.id) || []), followupDismissedOn: myDismissed.get(c.id) ?? null })),   // removed follow-ups: yours only
    // other people's emails arrive with no content at all: just that an email was sent or received, and by whom
    activities: acts.map((a) => canReadEmail(a, me.id) ? activityDTO(a, filesBy.get(a.id) || [], mailBy.get(a.id) || [])
      : { ...activityDTO(redactEmail(a), [], []), preview: false, truncated: false, hasHtml: false, private: true }),
    deals: deals.map((d) => ({ ...dealDTO(d), baseValue: Math.round(toBase(d.value, d.currency, fx) * 100) / 100 })),
    tasks: tasks.map((t) => ({ ...taskDTO(t), watcherIds: watchBy.get(t.id) || [], commentCount: Number(cBy.get(t.id)?.n || 0), fileCount: fBy.get(t.id) || 0,
      lastActivityAt: Math.max(t.updatedAt.getTime(), cBy.get(t.id)?.last ? new Date(cBy.get(t.id)!.last).getTime() : 0) })),
    notifications: notes.map((n) => ({ id: n.id, kind: n.kind, taskId: n.taskId, actorId: n.actorId, text: n.text, link: n.link, read: !!n.readAt, at: n.createdAt.getTime() })),
    payments, sows: bill.sows, billing: bill.items, projects: bill.projects, sowExpenses: bill.expenses, followups: bill.followups, snoozes,
    views: views.filter((v) => v.page === "contacts" || v.page === "deals").map((v) => ({ id: v.id, page: v.page as "contacts" | "deals", name: v.name, filters: v.filters, shared: v.shared, createdById: v.createdById })),
    booking: myBooking[0] ? { ...myBooking[0], updatedAt: myBooking[0].updatedAt.getTime(), url: `${appUrl()}/book/${myBooking[0].slug}` } : null,
    appUrl: appUrl(),
    templates: templates.map((t) => ({ id: t.id, name: t.name, subject: t.subject, body: t.body, sortOrder: t.sortOrder, createdById: t.createdById, updatedById: t.updatedById, updatedAt: t.updatedAt.getTime() })),
    teams: teams.map((t) => ({ id: t.id, name: t.name, description: t.description, color: t.color, leadId: t.leadId, target: t.target, createdAt: t.createdAt.getTime(),
      memberIds: tms.filter((x) => x.teamId === t.id).map((x) => x.userId), productIds: tps.filter((x) => x.teamId === t.id).map((x) => x.productId) })), events: events.map(eventDTO), sequences: seqs.map(sequenceDTO), enrollments: enr.map(enrollmentDTO),
    connection: conn[0] ? { provider: conn[0].provider, email: conn[0].email, status: conn[0].status, lastError: conn[0].lastError, lastSyncAt: conn[0].lastSyncAt?.getTime() ?? null, canSend: canSendMail(conn[0]) } : null,
    config: { brand: { appName: appName(), companyName: (await company()).name }, passwordAuth: passwordEnabled(), fx: { base: fx.base, rates: fx.rates, date: fx.date, manual: fx.manual, source: fx.source, error: fx.error }, fiscalStart: Number(((await getState("finance")) as { fiscalStart?: number } | null)?.fiscalStart || 1), mail: mailConfigured(), ai: aiConfigured(), aiProvider: aiProvider(), transcribe: !!process.env.OPENAI_API_KEY, taskMaxUploadMb: Math.round(TASK_MAX_UPLOAD_BYTES / 1048576), openTracking: process.env.EMAIL_OPEN_TRACKING !== "false", maxUploadMb: Math.round(MAX_UPLOAD_BYTES / 1048576),
      crm: crmConfigured(), practice: practiceMode(), webhook: !!process.env.WEBHOOK_URL, chat: !!(process.env.SLACK_WEBHOOK_URL || process.env.TEAMS_WEBHOOK_URL),
      mailboxProviders: [...(process.env.AUTH_MICROSOFT_ENTRA_ID_ID ? ["microsoft" as const] : []), ...(process.env.AUTH_GOOGLE_ID ? ["google" as const] : [])], intake: !!process.env.INTAKE_KEYS },
  };
  // finer permissions: no money or billing leaves the server for roles that may not see them
  const caps = await capsFor(me.role);
  data.caps = caps;
  if (!caps.billing) { data.payments = []; data.sows = []; data.billing = []; data.projects = []; data.sowExpenses = []; data.followups = []; }
  if (!caps.money) {
    data.deals = data.deals.map((d) => ({ ...d, value: 0 }));
    data.payments = data.payments.map((p) => ({ ...p, amount: 0 }));
    data.billing = data.billing.map((b) => ({ ...b, amount: 0 }));
    data.sows = data.sows.map((x) => ({ ...x, value: null }));
  }
  return data;
}
