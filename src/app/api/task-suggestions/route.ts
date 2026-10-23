import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";

/** Your suggested tasks from upcoming calendar meetings (nothing is added until you choose). */
export const GET = route(async () => {
  const me = await requireUser("viewer");
  const rows = await db.select().from(schema.taskSuggestions).where(and(eq(schema.taskSuggestions.userId, me.id), eq(schema.taskSuggestions.status, "new"))).orderBy(asc(schema.taskSuggestions.meetingAt));
  return ok({ suggestions: rows.filter((r) => !r.meetingAt || r.meetingAt.getTime() > Date.now() - 2 * 86400_000).map((r) => ({ ...r, meetingAt: r.meetingAt?.getTime() ?? null, createdAt: r.createdAt.getTime() })) });
});
/** Add the ones you picked (follow-ups also set the contact's follow-up date), or dismiss them. */
export const POST = route(async (req: Request) => {
  const me = await requireUser("rep");
  const d = await body(req, z.object({ ids: z.array(z.string().uuid()).min(1).max(200), action: z.enum(["add", "dismiss"]) }));
  const rows = (await db.select().from(schema.taskSuggestions).where(inArray(schema.taskSuggestions.id, d.ids))).filter((r) => r.userId === me.id && r.status === "new");
  let added = 0;
  for (const r of rows) {
    if (d.action === "dismiss") { await db.update(schema.taskSuggestions).set({ status: "dismissed" }).where(eq(schema.taskSuggestions.id, r.id)); continue; }
    const [t] = await db.insert(schema.tasks).values({ title: r.title, notes: r.notes, dueDate: r.dueDate, assigneeId: me.id, contactId: r.contactId, companyId: r.companyId, createdById: me.id, priority: "normal", sourceKey: r.sourceKey }).onConflictDoNothing().returning({ id: schema.tasks.id });
    if (r.kind === "follow" && r.contactId && r.dueDate) { const [c] = await db.select({ next: schema.contacts.nextFollowUp }).from(schema.contacts).where(eq(schema.contacts.id, r.contactId)).limit(1);
      if (c && (!c.next || c.next < r.dueDate)) await db.update(schema.contacts).set({ nextFollowUp: r.dueDate }).where(eq(schema.contacts.id, r.contactId)); }
    await db.update(schema.taskSuggestions).set({ status: "added", taskId: t?.id ?? null }).where(eq(schema.taskSuggestions.id, r.id)); added++;
  }
  return ok({ added, dismissed: d.action === "dismiss" ? rows.length : 0 });
});
