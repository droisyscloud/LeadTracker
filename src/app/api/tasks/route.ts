import { z } from "zod";
import { db, schema } from "@/db";
import { TASK_PRIORITIES, TASK_REPEATS, TASK_STATUSES } from "@/db/schema";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor } from "@/lib/access";
import { activeUsers, addWatchers, displayName, logEvent, notify } from "@/lib/tasks";

const input = z.object({
  title: z.string().trim().min(1).max(300), notes: z.string().max(10000).default(""),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  assigneeId: z.string().uuid().nullable().optional(),
  status: z.enum(TASK_STATUSES).default("todo"), priority: z.enum(TASK_PRIORITIES).default("normal"), repeat: z.enum(TASK_REPEATS).default("none"),
  watcherIds: z.array(z.string().uuid()).max(50).default([]),
  contactId: z.string().uuid().nullable().default(null), companyId: z.string().uuid().nullable().default(null), dealId: z.string().uuid().nullable().default(null),
  contactIds: z.array(z.string().uuid()).max(100).default([]), companyIds: z.array(z.string().uuid()).max(100).default([]),
});

export const POST = route(async (req: Request) => {
  const me = await requireUser("rep");
  const d = await body(req, input);
  const acc = await accessFor(me);
  // several leads and companies: the main ones are the first of each
  const cIds = [...new Set([...(d.contactId ? [d.contactId] : []), ...d.contactIds])]; const coIds = [...new Set([...(d.companyId ? [d.companyId] : []), ...d.companyIds])];
  for (const x of cIds) if (!acc.canSeeContact(x)) throw new HttpError(404, "Lead not found.");
  for (const x of coIds) if (!acc.canSeeCompany(x)) throw new HttpError(404, "Company not found.");
  d.contactId = cIds[0] ?? null; d.companyId = coIds[0] ?? null; d.contactIds = cIds; d.companyIds = coIds;
  const assigneeId = d.assigneeId === undefined ? me.id : d.assigneeId;
  const valid = new Set((await activeUsers([...(assigneeId ? [assigneeId] : []), ...d.watcherIds])).map((u) => u.id));
  const { watcherIds, ...fields } = d;
  const [t] = await db.insert(schema.tasks).values({ ...fields, assigneeId: assigneeId && valid.has(assigneeId) ? assigneeId : null,
    done: d.status === "done", doneAt: d.status === "done" ? new Date() : null, createdById: me.id }).returning();
  const tagged = watcherIds.filter((w) => valid.has(w) && w !== t.assigneeId);
  await addWatchers(t.id, tagged);
  await logEvent(t.id, me.id, "created this task");
  const who = displayName(me);
  if (t.assigneeId && t.assigneeId !== me.id) await notify([t.assigneeId], { kind: "assigned", taskId: t.id, actor: me, text: `${who} assigned you a task`, email: true, taskTitle: t.title, extra: d.notes || undefined });
  if (tagged.length) await notify(tagged, { kind: "tagged", taskId: t.id, actor: me, text: `${who} tagged you on a task`, email: true, taskTitle: t.title, extra: d.notes || undefined });
  return ok(t, 201);
});
