import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { canManage } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { templateFields } from "../schema";

type Ctx = { params: Promise<{ id: string }> };
async function load(id: string) {
  const [t] = await db.select().from(schema.emailTemplates).where(eq(schema.emailTemplates.id, id)).limit(1);
  if (!t) throw new HttpError(404, "Template not found.");
  return t;
}
/** Anyone who sends email can improve a shared template; deleting one is for its author or a manager. */
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser("rep");
  const { id } = await params; await load(id);
  const d = await body(req, z.object(templateFields).partial(), { patch: true });
  await db.update(schema.emailTemplates).set({ ...d, updatedById: me.id, updatedAt: new Date() }).where(eq(schema.emailTemplates.id, id));
  await audit(me.id, "template.updated", "template", id, { name: d.name });
  return ok({ ok: true });
});
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser("rep");
  const { id } = await params; const t = await load(id);
  if (!canManage(me.role) && t.createdById !== me.id) throw new HttpError(403, "Only the person who created this template or a manager can delete it.");
  await db.delete(schema.emailTemplates).where(eq(schema.emailTemplates.id, id));
  await audit(me.id, "template.deleted", "template", id, { name: t.name });
  return ok({ deleted: true });
});
