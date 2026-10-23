import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { canManage } from "@/lib/rbac";
import { restoreFromTrash } from "@/lib/trash";
import { audit } from "@/lib/audit";

/** Restore something from the recycle bin, with everything that was deleted with it. */
export const POST = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("rep"); const { id } = await params;
  const [t] = await db.select().from(schema.trash).where(eq(schema.trash.id, id)).limit(1);
  if (!t || (!canManage(me.role) && t.deletedById !== me.id)) throw new HttpError(404, "Not in the recycle bin.");
  try { await restoreFromTrash(id); }
  catch (e) { console.error("restore failed", e); throw new HttpError(409, "It couldn't be restored, because something it needs has changed. Nothing was changed."); }
  await audit(me.id, "trash.restored", t.kind, t.entityId, { label: t.label });
  return ok({ restored: true, kind: t.kind, entityId: t.entityId });
});
