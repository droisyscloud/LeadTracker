import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Role, TaskPriority, TaskStatus } from "@/db/schema";
import { HttpError } from "./http";
import { canManage } from "./rbac";
import { appUrl, mailConfigured } from "./config";
import { sendSystemEmail } from "./mail";
import { addNotifications } from "./notify";

export const STATUS_LABEL: Record<TaskStatus, string> = { todo: "To do", in_progress: "In progress", waiting: "Waiting on someone", done: "Done" };
export const PRIORITY_LABEL: Record<TaskPriority, string> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };

type Me = { id: string; role: Role; name: string | null; email: string };
export const displayName = (u: { name: string | null; email: string }) => u.name || u.email;

export async function loadTask(id: string) {
  const [t] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1);
  if (!t) throw new HttpError(404, "Task not found.");
  const watchers = (await db.select().from(schema.taskWatchers).where(eq(schema.taskWatchers.taskId, id))).map((w) => w.userId);
  return { t, watchers };
}
/** Who may do what on a task. Viewers can still reply when they have been tagged or assigned. */
export function taskRights(me: Me, t: typeof schema.tasks.$inferSelect, watchers: string[]) {
  const involved = t.createdById === me.id || t.assigneeId === me.id || watchers.includes(me.id);
  const manage = canManage(me.role);
  return {
    edit: manage || t.createdById === me.id || t.assigneeId === me.id,
    status: manage || t.createdById === me.id || t.assigneeId === me.id || watchers.includes(me.id),
    comment: involved || manage || me.role === "rep",
    remove: manage || t.createdById === me.id,
  };
}

export async function activeUsers(ids: string[]) {
  const uniq = [...new Set(ids)].filter(Boolean);
  if (!uniq.length) return [];
  return (await db.select().from(schema.users).where(inArray(schema.users.id, uniq))).filter((u) => u.status === "active");
}

export async function logEvent(taskId: string, authorId: string, body: string) {
  await db.insert(schema.taskComments).values({ taskId, authorId, kind: "event", body });
}

/** In-app notification for each person (never the actor), plus an email for the important kinds when email sending is on. */
export async function notify(userIds: string[], opts: { kind: typeof schema.notifications.$inferInsert.kind; taskId: string; actor: Me; text: string; email?: boolean; taskTitle: string; extra?: string }) {
  const people = (await activeUsers(userIds)).filter((u) => u.id !== opts.actor.id);
  if (!people.length) return;
  await addNotifications(people.map((u) => ({ userId: u.id, kind: opts.kind, taskId: opts.taskId, actorId: opts.actor.id, text: opts.text, link: `/tasks?id=${opts.taskId}` })));
  if (opts.email && mailConfigured()) {
    for (const u of people) {
      sendSystemEmail({ to: u.email, subject: `${opts.text}: ${opts.taskTitle}`,
        text: `${opts.text}.\n\nTask: ${opts.taskTitle}${opts.extra ? `\n\n${opts.extra}` : ""}\n\nOpen it: ${appUrl()}/tasks?id=${opts.taskId}` })
        .catch((e) => console.error("task email failed", e));
    }
  }
}

export async function setWatchers(taskId: string, ids: string[]) {
  const want = [...new Set(ids)];
  const have = (await db.select().from(schema.taskWatchers).where(eq(schema.taskWatchers.taskId, taskId))).map((w) => w.userId);
  const add = want.filter((x) => !have.includes(x)), drop = have.filter((x) => !want.includes(x));
  if (add.length) await db.insert(schema.taskWatchers).values(add.map((userId) => ({ taskId, userId }))).onConflictDoNothing();
  if (drop.length) await db.delete(schema.taskWatchers).where(and(eq(schema.taskWatchers.taskId, taskId), inArray(schema.taskWatchers.userId, drop)));
  return { add, drop };
}
export async function addWatchers(taskId: string, ids: string[]) {
  const uniq = [...new Set(ids)].filter(Boolean);
  if (uniq.length) await db.insert(schema.taskWatchers).values(uniq.map((userId) => ({ taskId, userId }))).onConflictDoNothing();
}
export async function touchTask(taskId: string) {
  await db.update(schema.tasks).set({ updatedAt: new Date() }).where(eq(schema.tasks.id, taskId));
}

/** Notifications about anything with a page: a lead, deal or company discussion. */
export async function notifyLink(userIds: string[], opts: { kind: typeof schema.notifications.$inferInsert.kind; actor: Me; text: string; link: string; title: string; email?: boolean; extra?: string }) {
  const people = (await activeUsers(userIds)).filter((u) => u.id !== opts.actor.id);
  if (!people.length) return;
  await addNotifications(people.map((u) => ({ userId: u.id, kind: opts.kind, actorId: opts.actor.id, text: `${opts.text}: ${opts.title}`, link: opts.link })));
  if (opts.email && mailConfigured()) for (const u of people) {
    sendSystemEmail({ to: u.email, subject: `${opts.text}: ${opts.title}`, text: `${opts.text} on ${opts.title}.${opts.extra ? `\n\n${opts.extra}` : ""}\n\nOpen it: ${appUrl()}${opts.link}` })
      .catch((e) => console.error("notify email failed", e));
  }
}
