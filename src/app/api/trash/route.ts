import { desc, eq, notLike } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { canManage } from "@/lib/rbac";

/** The recycle bin: managers and admins see everything; others see what they deleted. */
export const GET = route(async () => {
  const me = await requireUser("rep");
  const q = db.select({ id: schema.trash.id, kind: schema.trash.kind, entityId: schema.trash.entityId, label: schema.trash.label, detail: schema.trash.detail, deletedById: schema.trash.deletedById, deletedAt: schema.trash.deletedAt, files: schema.trash.fileKeys })
    .from(schema.trash).where(notLike(schema.trash.kind, "ps_%")).orderBy(desc(schema.trash.deletedAt)).limit(500);
  const rows = canManage(me.role) ? await q : (await q).filter((x) => x.deletedById === me.id);
  return ok({ items: rows.map((r) => ({ ...r, files: r.files.length, deletedAt: r.deletedAt.getTime(), purgeAt: r.deletedAt.getTime() + 30 * 86400_000 })) });
});
