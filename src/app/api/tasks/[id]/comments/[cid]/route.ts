import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { requireTask } from "@/lib/access";
import { canManage } from "@/lib/rbac";
import { deleteFile } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string; cid: string }> };
async function own(id: string, cid: string, meId: string, manage: boolean) {
  const [c] = await db.select().from(schema.taskComments).where(and(eq(schema.taskComments.id, cid), eq(schema.taskComments.taskId, id))).limit(1);
  if (!c || c.kind !== "comment") throw new HttpError(404, "Reply not found.");
  if (c.authorId !== meId && !manage) throw new HttpError(403, "You can change only your own replies.");
  return c;
}
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser("viewer");
  const { id, cid } = await params;
  await requireTask(me, id);
  await own(id, cid, me.id, false);
  const d = await body(req, z.object({ body: z.string().trim().min(1).max(10000) }));
  await db.update(schema.taskComments).set({ body: d.body, editedAt: new Date() }).where(eq(schema.taskComments.id, cid));
  return ok({ ok: true });
});
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser("viewer");
  const { id, cid } = await params;
  await requireTask(me, id);
  await own(id, cid, me.id, canManage(me.role));
  const fs = await db.select().from(schema.files).where(eq(schema.files.taskCommentId, cid));
  await db.delete(schema.taskComments).where(eq(schema.taskComments.id, cid));
  for (const f of fs) await deleteFile(f.storageKey).catch(() => undefined);
  return ok({ deleted: true });
});
