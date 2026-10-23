import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor } from "@/lib/access";
import { getFile } from "@/lib/storage";
import { serveBuffer } from "@/lib/serve";
import { canReadEmail } from "@/lib/emailPrivacy";

export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("viewer");
  const { id } = await params;
  const [f] = await db.select().from(schema.files).where(eq(schema.files.id, id)).limit(1);
  if (!f) throw new HttpError(404, "File not found.");
  const acc = await accessFor(me);
  let allowed = false;
  if (f.activityId) { const [a] = await db.select().from(schema.activities).where(eq(schema.activities.id, f.activityId)).limit(1); allowed = !!a && acc.canSeeContact(a.contactId) && canReadEmail(a, me.id); }
  else if (f.taskCommentId) { const [c] = await db.select({ t: schema.taskComments.taskId }).from(schema.taskComments).where(eq(schema.taskComments.id, f.taskCommentId)).limit(1); allowed = !!c && acc.canSeeTask(c.t); }
  else if (f.commentId) { const [c] = await db.select().from(schema.comments).where(eq(schema.comments.id, f.commentId)).limit(1);
    allowed = !!c && (c.entityType === "contact" ? acc.canSeeContact(c.entityId) : c.entityType === "deal" ? acc.canSeeDeal(c.entityId) : acc.canSeeCompany(c.entityId)); }
  if (!allowed) { const [s] = await db.select({ dealId: schema.sows.dealId }).from(schema.sows).where(eq(schema.sows.fileId, f.id)).limit(1); allowed = !!s && acc.canSeeDeal(s.dealId); }
  if (!allowed) throw new HttpError(404, "File not found.");
  return serveBuffer(req, await getFile(f.storageKey), f.name, f.contentType);
});
