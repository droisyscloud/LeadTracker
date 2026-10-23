import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor, requireCompany, requireContact, requireDeal, requireTask } from "@/lib/access";
import { mailConfigured } from "@/lib/config";

export const POST = route(async (req: Request) => {
  const me = await requireUser("rep");
  if (!mailConfigured()) throw new HttpError(501, "Sequences send email, so SMTP must be configured first.");
  const d = await body(req, z.object({ sequenceId: z.string().uuid(), contactIds: z.array(z.string().uuid()).min(1).max(500) }));
  const [seq] = await db.select().from(schema.sequences).where(eq(schema.sequences.id, d.sequenceId)).limit(1);
  if (!seq || !seq.active) throw new HttpError(404, "Sequence not found or paused.");
  const already = new Set((await db.select({ c: schema.enrollments.contactId }).from(schema.enrollments)
    .where(and(inArray(schema.enrollments.contactId, d.contactIds), eq(schema.enrollments.status, "active")))).map((r) => r.c));
  const acc = await accessFor(me);
  for (const cid of d.contactIds) await requireContact(me, cid, "write", acc);
  const contacts = (await db.select().from(schema.contacts).where(inArray(schema.contacts.id, d.contactIds))).filter((c) => !c.unsubscribedAt);
  const now = Date.now(); let enrolled = 0; const skipped: string[] = [];
  for (const c of contacts) {
    if (already.has(c.id) || !c.email) { skipped.push(c.name); continue; }
    await db.insert(schema.enrollments).values({ sequenceId: seq.id, contactId: c.id, enrolledById: me.id, nextAt: new Date(now + seq.steps[0].dayOffset * 86400_000) });
    enrolled++;
  }
  return ok({ enrolled, skipped });
});
