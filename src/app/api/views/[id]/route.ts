import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { canManage } from "@/lib/rbac";

export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("viewer");
  const { id } = await params;
  const [v] = await db.select().from(schema.savedViews).where(eq(schema.savedViews.id, id)).limit(1);
  if (!v) throw new HttpError(404, "View not found.");
  if (v.createdById !== me.id && !(v.shared && canManage(me.role))) throw new HttpError(403, "You can delete only your own views.");
  await db.delete(schema.savedViews).where(eq(schema.savedViews.id, id));
  return ok({ deleted: true });
});
