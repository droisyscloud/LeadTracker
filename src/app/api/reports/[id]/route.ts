import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { reportDef, schedule } from "@/lib/reportInput";

type Ctx = { params: Promise<{ id: string }> };
async function mine(id: string, me: { id: string; role: string }) {
  const [r] = await db.select().from(schema.reports).where(eq(schema.reports.id, id)).limit(1);
  if (!r || (r.ownerId !== me.id && me.role !== "admin")) throw new HttpError(404, "Report not found.");
  return r;
}
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser("viewer"); const { id } = await params; await mine(id, me);
  const d = await body(req, z.object({ name: z.string().trim().min(1).max(120), def: reportDef, shared: z.boolean(), schedule }).partial(), { patch: true });
  const [r] = await db.update(schema.reports).set({ ...d, updatedAt: new Date() }).where(eq(schema.reports.id, id)).returning();
  return ok({ ...r, createdAt: r.createdAt.getTime(), updatedAt: r.updatedAt.getTime(), lastSentAt: r.lastSentAt?.getTime() ?? null });
});
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser("viewer"); const { id } = await params; await mine(id, me);
  await db.delete(schema.reports).where(eq(schema.reports.id, id));
  return ok({ deleted: true });
});
