import { db, schema } from "@/db";
export async function audit(actorId: string | null, action: string, entity: string, entityId?: string | null, detail?: Record<string, unknown>) {
  try { await db.insert(schema.auditLog).values({ actorId, action, entity, entityId: entityId ?? null, detail: detail ?? null }); }
  catch (e) { console.error("audit log failed", e); }
}
