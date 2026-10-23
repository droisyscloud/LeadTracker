import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { audit } from "@/lib/audit";
import { requireBillingUser } from "@/lib/collectionsAccess";
import { projectInput } from "@/lib/collectionsInput";

type Ctx = { params: Promise<{ id: string }> };
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const me = await requireBillingUser(); const { id } = await params; const d = await body(req, projectInput.partial(), { patch: true });
  const [p] = await db.update(schema.projects).set(d).where(eq(schema.projects.id, id)).returning(); if (!p) throw new HttpError(404, "Project not found.");
  await audit(me.id, "project.updated", "project", id, { changes: Object.keys(d) });
  return ok({ ...p, createdAt: p.createdAt.getTime() });
});
/** Remove a project; its SOWs stay, just without a project. */
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireBillingUser(); const { id } = await params;
  await db.update(schema.sows).set({ projectId: null }).where(eq(schema.sows.projectId, id));
  const [p] = await db.delete(schema.projects).where(eq(schema.projects.id, id)).returning(); if (!p) throw new HttpError(404, "Project not found.");
  await audit(me.id, "project.deleted", "project", id, { name: p.name });
  return ok({ deleted: true });
});
