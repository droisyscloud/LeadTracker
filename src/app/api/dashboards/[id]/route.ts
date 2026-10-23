import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { appUrl } from "@/lib/config";

type Ctx = { params: Promise<{ id: string }> };
const dto = (d: typeof schema.dashboards.$inferSelect) => ({ id: d.id, name: d.name, reportIds: d.reportIds, linkOn: d.linkOn, url: `${appUrl()}/d/${d.token}`, createdAt: d.createdAt.getTime() });
/** Rename, change its reports, switch the link on or off, or make a new link (the old one stops working). */
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser("viewer"); const { id } = await params;
  const d = await body(req, z.object({ name: z.string().trim().min(1).max(120), reportIds: z.array(z.string().uuid()).min(1).max(12), linkOn: z.boolean(), newLink: z.boolean() }).partial(), { patch: true });
  const { newLink, ...rest } = d;
  const [r] = await db.update(schema.dashboards).set({ ...rest, ...(newLink ? { token: randomBytes(24).toString("base64url") } : {}) }).where(and(eq(schema.dashboards.id, id), eq(schema.dashboards.ownerId, me.id))).returning();
  if (!r) throw new HttpError(404, "Dashboard not found.");
  return ok(dto(r));
});
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser("viewer"); const { id } = await params;
  await db.delete(schema.dashboards).where(and(eq(schema.dashboards.id, id), eq(schema.dashboards.ownerId, me.id)));
  return ok({ deleted: true });
});
