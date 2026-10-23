import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { TASK_PRIORITIES, TASK_REPEATS, TASK_STATUSES } from "@/db/schema";
import { localToday, nextDue, REPEAT_LABEL } from "@/lib/reminders";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor, requireCompany, requireContact, requireDeal, requireTask } from "@/lib/access";
import { deleteFile } from "@/lib/storage";
import { activeUsers, displayName, loadTask, logEvent, notify, PRIORITY_LABEL, setWatchers, STATUS_LABEL, taskRights } from "@/lib/tasks";

type Ctx = { params: Promise<{ id: string }> };

/** Full task with its conversation and attachments. */
export const GET = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser("viewer");
  const { id } = await params;
  await requireTask(me, id);
  const { t, watchers } = await loadTask(id);
  const comments = await db.select().from(schema.taskComments).where(eq(schema.taskComments.taskId, id)).orderBy(asc(schema.taskComments.createdAt));
  const files = comments.length ? await db.select().from(schema.files).where(inArray(schema.files.taskCommentId, comments.map((c) => c.id))) : [];
  // opening the task marks its notifications as read
  await db.update(schema.notifications).set({ readAt: new Date() }).where(and(eq(schema.notifications.taskId, id), eq(schema.notifications.userId, me.id))).catch(() => undefined);
  return ok({
    rights: taskRights(me, t, watchers),
    comments: comments.map((c) => ({ id: c.id, kind: c.kind, authorId: c.authorId, body: c.body, mentionIds: c.mentionIds, createdAt: c.createdAt.getTime(), editedAt: c.editedAt?.getTime() ?? null,
      files: files.filter((f) => f.taskCommentId === c.id).map((f) => ({ id: f.id, name: f.name, contentType: f.contentType, size: f.size })) })),
  });
});

const patch = z.object({
  title: z.string().trim().min(1).max(300), notes: z.string().max(10000), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  assigneeId: z.string().uuid().nullable(), status: z.enum(TASK_STATUSES), priority: z.enum(TASK_PRIORITIES), repeat: z.enum(TASK_REPEATS), done: z.boolean(),
  watcherIds: z.array(z.string().uuid()).max(50),
  contactId: z.string().uuid().nullable(), companyId: z.string().uuid().nullable(), dealId: z.string().uuid().nullable(),
  contactIds: z.array(z.string().uuid()).max(100), companyIds: z.array(z.string().uuid()).max(100),
}).partial();

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser("viewer");
  const { id } = await params;
  await requireTask(me, id);
  const { t, watchers } = await loadTask(id);
  const rights = taskRights(me, t, watchers);
  const d = await body(req, patch);
  if (d.done !== undefined && d.status === undefined) d.status = d.done ? "done" : t.status === "done" ? "todo" : t.status;
  const { done: _done, watcherIds, ...rest } = d; void _done;
  const onlyStatus = Object.keys(rest).every((k) => k === "status") && watcherIds === undefined;
  if (onlyStatus ? !rights.status : !rights.edit) throw new HttpError(403, onlyStatus ? "Only people on this task can change its status." : "Only the person who created the task, its assignee or a manager can change it.");

  const who = displayName(me);
  const events: string[] = [];
  const set: Partial<typeof schema.tasks.$inferInsert> = { ...rest, updatedAt: new Date() };
  if (rest.contactIds !== undefined || rest.companyIds !== undefined) {   // changing which leads and companies it's linked to
    const acc2 = await accessFor(me);
    if (rest.contactIds !== undefined) { const ids = [...new Set(rest.contactIds)]; for (const x of ids) if (!acc2.canSeeContact(x)) throw new HttpError(404, "Lead not found."); set.contactIds = ids; set.contactId = ids[0] ?? null; }
    if (rest.companyIds !== undefined) { const ids = [...new Set(rest.companyIds)]; for (const x of ids) if (!acc2.canSeeCompany(x)) throw new HttpError(404, "Company not found."); set.companyIds = ids; set.companyId = ids[0] ?? null; }
  }
  if (rest.status && rest.status !== t.status) {
    set.done = rest.status === "done"; set.doneAt = rest.status === "done" ? new Date() : null;
    events.push(`changed the status to ${STATUS_LABEL[rest.status]}`);
  }
  if (rest.priority && rest.priority !== t.priority) events.push(`set the priority to ${PRIORITY_LABEL[rest.priority]}`);
  if (rest.repeat && rest.repeat !== t.repeat) events.push(rest.repeat === "none" ? "stopped it repeating" : `set it to repeat: ${REPEAT_LABEL[rest.repeat].toLowerCase()}`);
  if (rest.dueDate !== undefined && rest.dueDate !== t.dueDate) { set.reminderSentFor = null; set.overdueSentFor = null; }
  if (rest.dueDate !== undefined && rest.dueDate !== t.dueDate) events.push(rest.dueDate ? `changed the due date to ${rest.dueDate}` : "removed the due date");
  if (rest.title && rest.title !== t.title) events.push(`renamed the task to "${rest.title}"`);
  if (rest.notes !== undefined && rest.notes !== t.notes) events.push("updated the description");
  let newAssignee: string | null = null;
  if (rest.assigneeId !== undefined && rest.assigneeId !== t.assigneeId) {
    if (rest.assigneeId) { const [u] = await activeUsers([rest.assigneeId]); if (!u) throw new HttpError(400, "That person is not an active user."); events.push(`assigned it to ${displayName(u)}`); newAssignee = u.id; }
    else events.push("unassigned it");
  }
  const [row] = await db.update(schema.tasks).set(set).where(eq(schema.tasks.id, id)).returning();
  // a billing reminder: its date (and done, for renewals) stays in step with the billing line
  const [bill] = await db.select().from(schema.billingItems).where(eq(schema.billingItems.taskId, id)).limit(1);
  if (bill) {
    const bset: Partial<typeof schema.billingItems.$inferInsert> = {};
    if (rest.dueDate !== undefined && rest.dueDate !== t.dueDate) { if (bill.status === "invoiced") bset.paymentDue = rest.dueDate; else bset.dueDate = rest.dueDate; }
    if (bill.kind === "renewal" && row.done && bill.status === "scheduled") bset.status = "cancelled";
    if (Object.keys(bset).length) await db.update(schema.billingItems).set({ ...bset, updatedAt: new Date() }).where(eq(schema.billingItems.id, bill.id));
  }

  let added: string[] = [];
  if (watcherIds !== undefined) {
    const valid = (await activeUsers(watcherIds)).map((u) => u.id);
    const r = await setWatchers(id, valid); added = r.add;
    if (r.add.length) events.push(`tagged ${(await activeUsers(r.add)).map(displayName).join(", ")}`);
    if (r.drop.length) events.push(`removed ${(await activeUsers(r.drop)).map(displayName).join(", ")} from the task`);
  }
  for (const e of events) await logEvent(id, me.id, e);

  // repeating task finished: create the next one once, with the same people, links and details
  if (row.status === "done" && t.status !== "done" && row.repeat !== "none" && !row.repeatSpawnedId) {
    const today = localToday(process.env.TEAM_TIMEZONE || "America/Los_Angeles").date;
    const due = nextDue(row.repeat, row.dueDate || today, today);
    const [nx] = await db.insert(schema.tasks).values({ title: row.title, notes: row.notes, dueDate: due, assigneeId: row.assigneeId, contactId: row.contactId, contactIds: row.contactIds, companyIds: row.companyIds, companyId: row.companyId, dealId: row.dealId,
      priority: row.priority, repeat: row.repeat, status: "todo", createdById: row.createdById }).returning();
    const ws = (await db.select().from(schema.taskWatchers).where(eq(schema.taskWatchers.taskId, id))).map((w) => w.userId);
    if (ws.length) await db.insert(schema.taskWatchers).values(ws.map((userId) => ({ taskId: nx.id, userId }))).onConflictDoNothing();
    await db.update(schema.tasks).set({ repeatSpawnedId: nx.id }).where(eq(schema.tasks.id, id));
    await logEvent(id, me.id, `completed this repeat. The next one is due ${due}`);
    await logEvent(nx.id, me.id, `created this from the previous repeat (${REPEAT_LABEL[row.repeat].toLowerCase()})`);
  }

  const everyone = [row.createdById, row.assigneeId, ...(await db.select().from(schema.taskWatchers).where(eq(schema.taskWatchers.taskId, id))).map((w) => w.userId)].filter(Boolean) as string[];
  if (newAssignee) await notify([newAssignee], { kind: "assigned", taskId: id, actor: me, text: `${who} assigned you a task`, email: true, taskTitle: row.title });
  if (added.length) await notify(added, { kind: "tagged", taskId: id, actor: me, text: `${who} tagged you on a task`, email: true, taskTitle: row.title });
  if (rest.status && rest.status !== t.status) await notify(everyone.filter((x) => x !== newAssignee && !added.includes(x)), { kind: "status", taskId: id, actor: me, text: `${who} marked a task ${STATUS_LABEL[rest.status]}`, email: rest.status === "done", taskTitle: row.title });
  return ok(row);
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser("rep");
  const { id } = await params;
  await requireTask(me, id);
  const { t, watchers } = await loadTask(id);
  if (!taskRights(me, t, watchers).remove) throw new HttpError(403, "Only the person who created the task or a manager can delete it.");
  const cs = await db.select({ id: schema.taskComments.id }).from(schema.taskComments).where(eq(schema.taskComments.taskId, id));
  const fs = cs.length ? await db.select().from(schema.files).where(inArray(schema.files.taskCommentId, cs.map((c) => c.id))) : [];
  await db.delete(schema.tasks).where(eq(schema.tasks.id, id));
  for (const f of fs) await deleteFile(f.storageKey).catch(() => undefined);
  return ok({ deleted: true });
});
