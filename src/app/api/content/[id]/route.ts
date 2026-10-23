import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { canManage } from "@/lib/rbac";
import { deleteFile } from "@/lib/storage";

/** Remove a document (its links stop working). Managers, or whoever added it. */
export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("rep"); const { id } = await params;
  const [d] = await db.select().from(schema.content).where(eq(schema.content.id, id)).limit(1);
  if (!d) throw new HttpError(404, "Document not found.");
  if (!canManage(me.role) && d.createdById !== me.id) throw new HttpError(403, "Only managers can remove documents someone else added.");
  await db.delete(schema.content).where(eq(schema.content.id, id)); await deleteFile(d.storageKey).catch(() => undefined);
  return ok({ deleted: true });
});
