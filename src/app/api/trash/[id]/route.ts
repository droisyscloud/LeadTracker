import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { canManage } from "@/lib/rbac";
import { purgeTrash } from "@/lib/trash";
import { audit } from "@/lib/audit";
import { requireCap } from "@/lib/permissions";

/** Delete forever (managers and admins, or the person who deleted it). */
export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("rep"); await requireCap(me, "delete"); const { id } = await params;
  const [t] = await db.select().from(schema.trash).where(eq(schema.trash.id, id)).limit(1);
  if (!t || (!canManage(me.role) && t.deletedById !== me.id)) throw new HttpError(404, "Not in the recycle bin.");
  await purgeTrash(id);
  await audit(me.id, "trash.purged", t.kind, t.entityId, { label: t.label });
  return ok({ deleted: true });
});
