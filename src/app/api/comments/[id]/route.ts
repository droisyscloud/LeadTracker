import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { canManage } from "@/lib/rbac";
import { deleteFile } from "@/lib/storage";

export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("viewer");
  const { id } = await params;
  const [c] = await db.select().from(schema.comments).where(eq(schema.comments.id, id)).limit(1);
  if (!c) throw new HttpError(404, "Comment not found.");
  if (c.authorId !== me.id && !canManage(me.role)) throw new HttpError(403, "You can delete only your own comments.");
  const fs = await db.select().from(schema.files).where(eq(schema.files.commentId, id));
  await db.delete(schema.comments).where(eq(schema.comments.id, id));
  for (const f of fs) await deleteFile(f.storageKey).catch(() => undefined);
  return ok({ deleted: true });
});

/** Edit a note or comment you wrote (admins can fix anyone's). */
export const PATCH = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("viewer");
  const { id } = await params; const d = await body(req, z.object({ body: z.string().trim().min(1).max(20000) }));
  const [c] = await db.select().from(schema.comments).where(eq(schema.comments.id, id)).limit(1);
  if (!c) throw new HttpError(404, "Comment not found.");
  if (c.authorId !== me.id && me.role !== "admin") throw new HttpError(403, "You can edit only what you wrote.");
  const [x] = await db.update(schema.comments).set({ body: d.body, editedAt: new Date() }).where(eq(schema.comments.id, id)).returning();
  return ok({ id: x.id, body: x.body, editedAt: x.editedAt?.getTime() ?? null });
});
