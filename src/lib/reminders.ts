import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { TaskRepeat } from "@/db/schema";
import { appUrl, mailConfigured } from "./config";
import { sendSystemEmail } from "./mail";
import { addNotifications } from "./notify";

/** Today's date and hour in a person's time zone. */
export function localToday(tz: string, d = new Date()) {
  let zone = tz; try { new Intl.DateTimeFormat("en-CA", { timeZone: tz }); } catch { zone = "UTC"; }
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}
export function addDays(date: string, n: number) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function addMonths(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1, 12)); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0, 12)).getUTCDate();
  t.setUTCDate(Math.min(d, last)); return t.toISOString().slice(0, 10);
}
/** The next due date for a repeating task, moved forward past today so a late finish doesn't create an overdue copy. */
export function nextDue(repeat: TaskRepeat, from: string, today: string): string {
  const step = (x: string) => repeat === "daily" ? addDays(x, 1) : repeat === "weekly" ? addDays(x, 7) : repeat === "biweekly" ? addDays(x, 14) : repeat === "monthly" ? addMonths(x, 1) : addMonths(x, 3);
  let n = step(from); let guard = 0;
  while (n <= today && guard++ < 400) n = step(n);
  return n;
}
export const REPEAT_LABEL: Record<TaskRepeat, string> = { none: "Does not repeat", daily: "Every day", weekly: "Every week", biweekly: "Every 2 weeks", monthly: "Every month", quarterly: "Every 3 months" };

/**
 * Runs every few minutes. From 8am in each person's time zone it sends, once per task and due date:
 * a "due tomorrow" reminder to the assignee, and an "overdue" alert to the assignee and the person who created it.
 */
export async function runReminders() {
  const tasks = await db.select().from(schema.tasks).where(and(ne(schema.tasks.status, "done"), isNotNull(schema.tasks.dueDate), isNotNull(schema.tasks.assigneeId)));
  if (!tasks.length) return { dueSoon: 0, overdue: 0 };
  const users = new Map((await db.select().from(schema.users)).map((u) => [u.id, u]));
  let dueSoon = 0, overdue = 0;
  for (const t of tasks) {
    const u = users.get(t.assigneeId!); if (!u || u.status !== "active") continue;
    const now = localToday(u.timezone || process.env.TEAM_TIMEZONE || "America/Los_Angeles");
    if (now.hour < Number(process.env.REMINDER_HOUR ?? 8)) continue;
    const link = `/tasks?id=${t.id}`;
    if (t.dueDate === addDays(now.date, 1) && t.reminderSentFor !== t.dueDate) {
      await db.update(schema.tasks).set({ reminderSentFor: t.dueDate }).where(eq(schema.tasks.id, t.id));
      await addNotifications([{ userId: u.id, kind: "due", taskId: t.id, text: "Due tomorrow", link }]);
      if (mailConfigured()) await sendSystemEmail({ to: u.email, subject: `Due tomorrow: ${t.title}`, text: `A reminder that this task is due tomorrow (${t.dueDate}).\n\nTask: ${t.title}${t.notes ? `\n\n${t.notes}` : ""}\n\nOpen it: ${appUrl()}${link}` }).catch((e) => console.error("reminder email", e));
      dueSoon++;
    } else if (t.dueDate! < now.date && t.overdueSentFor !== t.dueDate) {
      await db.update(schema.tasks).set({ overdueSentFor: t.dueDate }).where(eq(schema.tasks.id, t.id));
      const people = [...new Set([u.id, t.createdById].filter(Boolean) as string[])].map((id) => users.get(id)).filter((x) => x && x.status === "active");
      for (const p of people) {
        const mine = p!.id === u.id;
        await addNotifications([{ userId: p!.id, kind: "overdue", taskId: t.id, text: mine ? "Your task is overdue" : `Overdue, assigned to ${u.name || u.email}`, link }]);
        if (mailConfigured()) await sendSystemEmail({ to: p!.email, subject: `Overdue: ${t.title}`, text: `${mine ? "This task" : `This task, assigned to ${u.name || u.email},`} was due on ${t.dueDate} and is not done yet.\n\nTask: ${t.title}\n\nOpen it: ${appUrl()}${link}` }).catch((e) => console.error("overdue email", e));
      }
      overdue++;
    }
  }
  return { dueSoon, overdue };
}
