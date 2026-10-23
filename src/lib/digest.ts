import { and, eq, isNull, lte, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { appUrl, mailConfigured } from "./config";
import { sendSystemEmail } from "./mail";
import { announce } from "./chat";
import { getState, setState } from "./jobstate";
import { getFx, toBase } from "./fx";
import { appName } from "./brand";

const HOUR = () => Number(process.env.DIGEST_HOUR || 7);
function localParts(tz: string, d = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false, weekday: "short" });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, weekday: p.weekday };
}

type U = typeof schema.users.$inferSelect;
export async function buildDigest(u: U) {
  const today = localParts(u.timezone).date;
  const mine = (await db.select().from(schema.contacts).where(eq(schema.contacts.ownerId, u.id))).filter((x) => !x.personal || x.createdById === u.id);
  const acts = await db.select({ contactId: schema.activities.contactId, type: schema.activities.type, at: schema.activities.at }).from(schema.activities);
  const outbound = new Set(acts.filter((a) => ["email", "call", "meeting"].includes(a.type)).map((a) => a.contactId));
  const open = mine.filter((c) => c.status !== "won" && c.status !== "lost");
  const myDis = new Map((await db.select().from(schema.followupDismissals).where(eq(schema.followupDismissals.userId, u.id))).map((x) => [x.contactId, x.dismissedOn]));
  const dismissed = (c: { id: string; nextFollowUp: string | null }) => { const on = myDis.get(c.id); return !!on && (!c.nextFollowUp || c.nextFollowUp <= on); };   // removed by this person only
  const due = open.filter((c) => !dismissed(c) && ((c.nextFollowUp && c.nextFollowUp <= today) || !outbound.has(c.id)));
  const cold = open.filter((c) => !due.includes(c) && c.lastTouchAt && Date.now() - c.lastTouchAt.getTime() > 5 * 86400_000);
  const tasks = await db.select().from(schema.tasks).where(and(eq(schema.tasks.assigneeId, u.id), eq(schema.tasks.done, false), or(isNull(schema.tasks.dueDate), lte(schema.tasks.dueDate, today))));
  const line = (c: typeof mine[number]) => `- ${c.name}${c.title ? `, ${c.title}` : ""}: ${appUrl()}/contacts?id=${c.id}`;
  const parts = [
    `Good morning${u.name ? " " + u.name.split(" ")[0] : ""}. Here is your ${appName()} summary for ${today}.`,
    `Follow up today (${due.length})`, ...(due.length ? due.slice(0, 15).map(line) : ["- Nothing due."]),
    `Tasks due (${tasks.length})`, ...(tasks.length ? tasks.slice(0, 15).map((t) => `- ${t.title}${t.dueDate ? ` (due ${t.dueDate})` : ""}`) : ["- No tasks due."]),
    ...(cold.length ? [`Going cold (${cold.length})`, ...cold.slice(0, 10).map(line)] : []),
    `Open the tracker: ${appUrl()}/followups`,
  ];
  if (process.env.DIGEST_AI === "true" && (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) && (due.length || tasks.length)) {
    try {
      const { complete } = await import("./llm");
      const ai = (await complete({ maxTokens: 250, prompt:
        `In two or three plain sentences (no em dashes, no markdown), tell this salesperson which follow-ups to do first today and why, using only this data:\nDue: ${JSON.stringify(due.slice(0, 15).map((c) => ({ name: c.name, title: c.title, stage: c.status, rating: c.rating, nextFollowUp: c.nextFollowUp })))}\nTasks: ${JSON.stringify(tasks.slice(0, 10).map((t) => ({ title: t.title, due: t.dueDate })))}` })).trim();
      if (ai) parts.splice(1, 0, `Today's focus: ${ai}`);
    } catch (e) { console.error("digest AI failed", e); }
  }
  return { subject: `Your follow-ups for ${today}: ${due.length} leads, ${tasks.length} tasks`, text: parts.join("\n\n").replace(/\n\n- /g, "\n- "), count: due.length + tasks.length };
}

/** Sends each opted-in person their digest once per local day after DIGEST_HOUR, plus a daily team summary to Slack/Teams. */
export async function runDigests(force?: { userId: string }): Promise<{ sent: number }> {
  let sent = 0;
  const users = force ? await db.select().from(schema.users).where(eq(schema.users.id, force.userId))
    : await db.select().from(schema.users).where(and(eq(schema.users.status, "active"), eq(schema.users.digestOptIn, true)));
  for (const u of users) {
    if (u.role === "viewer" && !force) continue;
    const lp = localParts(u.timezone);
    const last = u.lastDigestAt ? localParts(u.timezone, u.lastDigestAt).date : null;
    if (!force && (lp.hour < HOUR() || last === lp.date || lp.weekday === "Sat" || lp.weekday === "Sun")) continue;
    const d = await buildDigest(u);
    if (mailConfigured() && (d.count > 0 || force)) { await sendSystemEmail({ to: u.email, subject: d.subject, text: d.text }); sent++; }
    await db.update(schema.users).set({ lastDigestAt: new Date() }).where(eq(schema.users.id, u.id));
  }
  if (!force && (process.env.SLACK_WEBHOOK_URL || process.env.TEAMS_WEBHOOK_URL)) {
    const tz = process.env.TEAM_TIMEZONE || "America/Los_Angeles"; const lp = localParts(tz);
    const st = (await getState("team-digest")) as { date?: string } | null;
    if (lp.hour >= HOUR() && st?.date !== lp.date && lp.weekday !== "Sat" && lp.weekday !== "Sun") {
      const since = new Date(Date.now() - 86400_000);
      const acts = await db.select().from(schema.activities);
      const y = acts.filter((a) => a.at >= since && a.byId);
      const contacts = (await db.select().from(schema.contacts)).filter((x) => !x.personal);   // never anyone's personal contacts
      const deals = await db.select().from(schema.deals);
      const fx = await getFx(); const openVal = deals.filter((d) => d.stage !== "won" && d.stage !== "lost").reduce((n, d) => n + toBase(d.value, d.currency, fx), 0);
      await announce("dailySummary", [`*${appName()} daily summary* (${lp.date})`,
        `Last 24h: ${y.filter((a) => a.type === "email").length} emails, ${y.filter((a) => a.type === "call").length} calls, ${y.filter((a) => a.type === "reply").length} replies, ${new Set(y.filter((a) => a.type === "meeting").map((a) => `${a.byId}|${a.meetingAt?.getTime?.() ?? a.meetingAt}|${(a.subject || "").toLowerCase()}`)).size} meetings`,
        `Leads: ${contacts.length} total, ${contacts.filter((c) => c.status === "new").length} not contacted`,
        `Open pipeline: $${openVal.toLocaleString("en-US")} across ${deals.filter((d) => d.stage !== "won" && d.stage !== "lost").length} deals`,
        `${appUrl()}/home`].join("\n"));
      await setState("team-digest", { date: lp.date });
    }
  }
  return { sent };
}
