import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { requireDeal } from "@/lib/access";

/** Everything that changed on a deal: who, when, and what from/to. */
export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("viewer"); const { id } = await params;
  await requireDeal(me, id);
  const rows = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.entity, "deal"), eq(schema.auditLog.entityId, id))).orderBy(desc(schema.auditLog.at)).limit(300);
  return ok({ items: rows.map((r) => ({ id: r.id, action: r.action, actorId: r.actorId, at: r.at.getTime(), detail: r.detail })) });
});
