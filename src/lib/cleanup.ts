import { and, eq, inArray, like, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { getState, setState } from "./jobstate";
import { addNotifications } from "./notify";

/**
 * One-time clean-up: the meeting automation made prep/follow-up tasks (and follow-up dates) for meetings that had
 * already happened when the calendar sync started running on its own. Removes those tasks if they're still open,
 * and clears a follow-up date only if it's still exactly the one the automation set. Done tasks and anything
 * people created or changed themselves are left alone.
 */
export async function cleanupPastMeetingTasks(force = false) {
  const flag = "cleanup:past-meeting-tasks-v1";
  if (!force && (await getState(flag))) return { skipped: "already done" };
  const tasks = await db.select().from(schema.tasks).where(and(or(like(schema.tasks.sourceKey, "prep:%"), like(schema.tasks.sourceKey, "follow:%")), eq(schema.tasks.done, false)));
  const meetings = await db.select({ id: schema.activities.id, externalId: schema.activities.externalId, meetingAt: schema.activities.meetingAt }).from(schema.activities).where(eq(schema.activities.origin, "calendar"));
  const startOf = (key: string): Date | null => { const rest = key.replace(/^(prep|follow):/, "");
    const byActivity = meetings.find((m) => m.id === rest); if (byActivity) return byActivity.meetingAt;   // older key: the meeting's own id
    const evId = rest.split(":")[0]; const m = meetings.find((x) => (x.externalId || "").startsWith(`cal:${evId}#`)); return m?.meetingAt ?? null; };
  const remove: string[] = []; const followDates: { contactId: string; date: string }[] = [];
  for (const t of tasks) { const st = startOf(t.sourceKey || ""); if (!st || st.getTime() >= t.createdAt.getTime()) continue;   // the meeting was still to come when the task was made: a real one
    remove.push(t.id); if (t.sourceKey?.startsWith("follow:") && t.contactId && t.dueDate) followDates.push({ contactId: t.contactId, date: t.dueDate }); }
  if (remove.length) await db.delete(schema.tasks).where(inArray(schema.tasks.id, remove));
  let cleared = 0;
  for (const f of followDates) { const r = await db.update(schema.contacts).set({ nextFollowUp: null }).where(and(eq(schema.contacts.id, f.contactId), eq(schema.contacts.nextFollowUp, f.date))).returning({ id: schema.contacts.id }); cleared += r.length; }
  await setState(flag, { at: Date.now(), tasks: remove.length, followUps: cleared });
  if (remove.length || cleared) {
    const admins = (await db.select({ id: schema.users.id, role: schema.users.role, status: schema.users.status }).from(schema.users)).filter((u) => u.status === "active" && u.role === "admin");
    await addNotifications(admins.map((u) => ({ userId: u.id, kind: "status" as const, text: `Cleaned up ${remove.length} task${remove.length === 1 ? "" : "s"} and ${cleared} follow-up date${cleared === 1 ? "" : "s"} that were created for meetings that had already happened. Tasks you created or completed were not touched.`, link: "/tasks" })));
  }
  return { tasks: remove.length, followUps: cleared };
}

/**
 * One-time clean-up: emails the sync logged on people who were only in Cc (not the sender, not in To) are removed
 * from those people's timelines. Only emails logged by the sync are touched; the copies on the sender's and the
 * To recipients' timelines stay.
 */
export async function cleanupCcCopies(force = false) {
  const flag = "cleanup:cc-copies-v1";
  if (!force && (await getState(flag))) return { skipped: "already done" };
  const contacts = await db.select({ id: schema.contacts.id, email: schema.contacts.email, other: schema.contacts.otherEmails }).from(schema.contacts);
  const mails = new Map(contacts.map((c) => [c.id, [c.email, ...(c.other || [])].map((e) => (e || "").toLowerCase()).filter(Boolean)]));
  const acts = await db.select({ id: schema.activities.id, contactId: schema.activities.contactId, from: schema.activities.emailFrom, to: schema.activities.emailTo, cc: schema.activities.emailCc })
    .from(schema.activities).where(and(eq(schema.activities.origin, "sync"), inArray(schema.activities.type, ["email", "reply"])));
  const remove: string[] = [];
  for (const a of acts) { const mine = mails.get(a.contactId) || []; if (!mine.length) continue;
    const between = [a.from || "", ...(a.to || [])].map((e) => e.toLowerCase()); const inCc = (a.cc || []).some((e) => mine.includes(e.toLowerCase()));
    if (inCc && !mine.some((e) => between.includes(e))) remove.push(a.id); }
  for (let i = 0; i < remove.length; i += 500) await db.delete(schema.activities).where(inArray(schema.activities.id, remove.slice(i, i + 500)));
  await setState(flag, { at: Date.now(), removed: remove.length });
  if (remove.length) {
    const admins = (await db.select({ id: schema.users.id, role: schema.users.role, status: schema.users.status }).from(schema.users)).filter((u) => u.status === "active" && u.role === "admin");
    await addNotifications(admins.map((u) => ({ userId: u.id, kind: "status" as const, text: `Tidied timelines: removed ${remove.length} email cop${remove.length === 1 ? "y" : "ies"} from people who were only in Cc. Each email still shows on the sender and the people it was sent to.`, link: "/contacts" })));
  }
  return { removed: remove.length };
}
