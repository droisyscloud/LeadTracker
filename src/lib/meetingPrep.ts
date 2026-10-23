import { createHash } from "crypto";
import { and, eq, gt, lte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { complete, parseJson } from "./llm";
import { aiConfigured } from "./config";
import { contactContext } from "./summary";
import { addNotifications } from "./notify";
import { sendSystemEmail } from "./mail";
import { mailConfigured, appUrl } from "./config";
import { company, who } from "./brand";

export type Brief = { who: string; company: string; history: string[]; theyAsked: string[]; openQuestions: string[]; products: string[]; deal: string; talkingPoints: string[]; watchOuts: string[];
  meetingAt: number | null; generatedAt: number; stale: boolean };

/**
 * A short brief before meeting a lead, from what the app knows: who they are, the history,
 * what they asked for, open questions, products, the deal, talking points and things to watch.
 * It doesn't search the web, so it never claims outside news.
 */
export async function meetingBrief(contactId: string, userId: string, opts: { force?: boolean; peek?: boolean; meetingAt?: number | null } = {}): Promise<Brief | null> {
  const ctx = await contactContext(contactId, userId);
  const json = JSON.stringify(ctx.data);
  const hash = createHash("sha256").update(json).digest("hex");
  const key = `prep:${contactId}:for:${userId}`;
  const [hit] = await db.select().from(schema.aiSummaries).where(eq(schema.aiSummaries.key, key)).limit(1);
  const fresh = !!hit && hit.dataHash === hash;
  if (hit && (fresh || opts.peek) && !opts.force) return { ...(hit.content as Omit<Brief, "generatedAt" | "stale">), generatedAt: hit.createdAt.getTime(), stale: !fresh };
  if (opts.peek || !aiConfigured()) return null;
  const when = opts.meetingAt ? new Date(opts.meetingAt).toISOString() : "soon";
  const us = await company();
  const prompt = `You prepare a short meeting brief for a salesperson at ${who(us)} about to meet a lead (meeting time: ${when}).
Use only the data below; never invent facts, people or news. You have no access to the web, so do not mention news.
Return only JSON: {"who": "one sentence on the person and their role", "company": "one sentence on their company from the data", "history": ["3 to 5 short points on what has happened so far, with dates"],
 "theyAsked": ["things they asked for or care about"], "openQuestions": ["questions still open or worth asking"], "products": ["products they're interested in"], "deal": "one sentence on the deal or 'No deal yet'",
 "talkingPoints": ["3 to 5 concrete things to say or cover"], "watchOuts": ["risks, sensitivities or things not to forget"]}
Keep every item short and specific.

Lead:
${json.slice(0, 14000)}`;
  const j = parseJson<Record<string, unknown>>(await complete({ prompt, maxTokens: 900 }), "{");
  const arr = (v: unknown, n = 6) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, n) : []);
  const content = { who: String(j.who || "").slice(0, 300), company: String(j.company || "").slice(0, 300), history: arr(j.history), theyAsked: arr(j.theyAsked), openQuestions: arr(j.openQuestions),
    products: arr(j.products), deal: String(j.deal || "").slice(0, 300), talkingPoints: arr(j.talkingPoints), watchOuts: arr(j.watchOuts), meetingAt: opts.meetingAt ?? null };
  const at = new Date(Math.floor(Date.now() / 1000) * 1000);
  await db.insert(schema.aiSummaries).values({ key, content, dataHash: hash, createdById: userId, createdAt: at })
    .onConflictDoUpdate({ target: schema.aiSummaries.key, set: { content, dataHash: hash, createdById: userId, createdAt: at } });
  return { ...content, generatedAt: at.getTime(), stale: false };
}

const asText = (b: Brief, name: string) => [
  `Meeting prep: ${name}`, "", b.who, b.company, "",
  b.history.length ? "So far:\n" + b.history.map((x) => `- ${x}`).join("\n") : "",
  b.theyAsked.length ? "They asked for:\n" + b.theyAsked.map((x) => `- ${x}`).join("\n") : "",
  b.openQuestions.length ? "Open questions:\n" + b.openQuestions.map((x) => `- ${x}`).join("\n") : "",
  b.products.length ? `Products: ${b.products.join(", ")}` : "", b.deal ? `Deal: ${b.deal}` : "",
  b.talkingPoints.length ? "Talking points:\n" + b.talkingPoints.map((x) => `- ${x}`).join("\n") : "",
  b.watchOuts.length ? "Watch out for:\n" + b.watchOuts.map((x) => `- ${x}`).join("\n") : "",
].filter(Boolean).join("\n\n");

/** About an hour before each booked meeting with a lead, send its brief to the person who booked it. */
export async function runMeetingPrep() {
  if (!aiConfigured()) return { skipped: "AI not configured" };
  const now = Date.now();
  const soon = await db.select().from(schema.activities).where(and(eq(schema.activities.type, "meeting"), gt(schema.activities.meetingAt, new Date(now + 20 * 60_000)), lte(schema.activities.meetingAt, new Date(now + 75 * 60_000))));
  let sent = 0;
  // a meeting is logged on every invited contact: brief once per company (or person without one), not once per attendee
  const cos = soon.length ? await db.select({ id: schema.contacts.id, companyId: schema.contacts.companyId }).from(schema.contacts).where(inArray(schema.contacts.id, soon.map((x) => x.contactId))) : [];
  const groupKey = (x: typeof soon[number]) => `${x.byId}|${x.meetingAt?.getTime()}|${(x.subject || "").trim().toLowerCase()}|${cos.find((c) => c.id === x.contactId)?.companyId || x.contactId}`;
  const firstOf = new Map<string, string>(); for (const x of soon) { const k = groupKey(x); if (!firstOf.has(k)) firstOf.set(k, x.id); }
  for (const a of soon) {
    if (firstOf.get(groupKey(a)) !== a.id) continue;
    const key = `prepsent:${a.id}`;
    const [done] = await db.select().from(schema.aiSummaries).where(eq(schema.aiSummaries.key, key)).limit(1);
    if (done || !a.byId) continue;
    const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, a.contactId)).limit(1); if (!c) continue;
    try {
      const b = await meetingBrief(c.id, a.byId, { meetingAt: a.meetingAt?.getTime() ?? null, force: true });
      if (!b) continue;
      const link = `/contacts?id=${c.id}&prep=1`;
      await addNotifications([{ userId: a.byId, kind: "task" as const, taskId: null, text: `Meeting prep ready: ${c.name} at ${a.meetingAt?.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`, link }]);
      const [u] = await db.select().from(schema.users).where(eq(schema.users.id, a.byId)).limit(1);
      if (u && mailConfigured()) await sendSystemEmail({ to: u.email, subject: `Meeting prep: ${c.name}`, text: `${asText(b, c.name)}\n\nOpen the lead: ${appUrl()}${link}` }).catch(() => undefined);
      await db.insert(schema.aiSummaries).values({ key, content: { sentAt: Date.now() }, dataHash: "sent", createdById: a.byId }).onConflictDoNothing();
      sent++;
    } catch (e) { console.error("meeting prep failed", a.id, e); }
  }
  return { upcoming: soon.length, sent };
}
