import { and, eq, gt, lte } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db, schema } from "@/db";
import { mailConfigured } from "./config";
import { sendAsUser } from "./sendmail";
import { complianceFooter, unsubHeaders } from "./compliance";
import { recordTouch } from "./touch";
import { company } from "./brand";

const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));

/** Sends every due sequence step. Stops on a reply, a closed lead, or a missing email. */
export async function runSequences(): Promise<{ sent: number; stopped: number }> {
  // nothing can send: no shared mailbox and nobody has connected a mailbox with send permission
  if (!mailConfigured() && !(await db.select({ s: schema.connections.scope }).from(schema.connections)).some((c) => /gmail\.send|Mail\.Send/i.test(c.s))) return { sent: 0, stopped: 0 };
  const due = await db.select().from(schema.enrollments).where(and(eq(schema.enrollments.status, "active"), lte(schema.enrollments.nextAt, new Date())));
  let sent = 0, stopped = 0;
  for (const e of due) {
    const stop = async (reason: string) => { await db.update(schema.enrollments).set({ status: "stopped", stoppedReason: reason, nextAt: null }).where(eq(schema.enrollments.id, e.id)); stopped++; };
    const [seq] = await db.select().from(schema.sequences).where(eq(schema.sequences.id, e.sequenceId)).limit(1);
    const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, e.contactId)).limit(1);
    if (!seq || !seq.active) { await stop("Sequence paused"); continue; }
    if (!c || !c.email) { await stop("No email address"); continue; }
    if (c.unsubscribedAt) { await stop("Unsubscribed"); continue; }
    if (c.status === "won" || c.status === "lost") { await stop("Lead closed"); continue; }
    const replied = await db.select({ id: schema.activities.id }).from(schema.activities)
      .where(and(eq(schema.activities.contactId, c.id), eq(schema.activities.type, "reply"), gt(schema.activities.at, e.enrolledAt))).limit(1);
    if (replied.length) { await stop("Replied"); continue; }
    const step = seq.steps[e.step];
    if (!step) { await db.update(schema.enrollments).set({ status: "completed", nextAt: null }).where(eq(schema.enrollments.id, e.id)); continue; }
    const [sender] = e.enrolledById ? await db.select().from(schema.users).where(eq(schema.users.id, e.enrolledById)).limit(1) : [];
    if (!sender || sender.status !== "active") { await stop("Sender no longer active"); continue; }
    const [co] = c.companyId ? await db.select().from(schema.companies).where(eq(schema.companies.id, c.companyId)).limit(1) : [];
    const vars = { first: c.name.split(/\s+/)[0] || "there", name: c.name, company: co?.name || "your team", me: sender.name || "", mycompany: (await company()).name };
    const subject = fill(step.subject, vars), body = fill(step.body, vars);
    const trackToken = randomBytes(18).toString("base64url");
    let messageId = "";
    try {
      // every automated email carries the postal address and a one-click unsubscribe
      const r = await sendAsUser(sender, { to: c.email, subject, text: body + (await complianceFooter(c.id)), trackToken, headers: unsubHeaders(c.id) }); messageId = r.messageId;
    } catch (err) {
      await db.update(schema.enrollments).set({ lastError: String(err instanceof Error ? err.message : err).slice(0, 300), nextAt: new Date(Date.now() + 3600_000) }).where(eq(schema.enrollments.id, e.id));
      continue;
    }
    await db.insert(schema.activities).values({ contactId: c.id, type: "email", subject, body, byId: sender.id, delivery: "sent", trackToken, origin: "sequence", kind: `${seq.name}, step ${e.step + 1}`, externalId: messageId ? `${messageId}#${c.id}` : null });
    await recordTouch(c.id, "email", { byId: sender.id });
    const next = seq.steps[e.step + 1];
    await db.update(schema.enrollments).set(next
      ? { step: e.step + 1, nextAt: new Date(Math.max(Date.now(), e.enrolledAt.getTime() + next.dayOffset * 86400_000)), lastError: null }
      : { step: e.step + 1, status: "completed", nextAt: null, lastError: null }).where(eq(schema.enrollments.id, e.id));
    sent++;
  }
  return { sent, stopped };
}
