import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser("manager");
  const { id } = await params;
  const d = await body(req, z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(500) }).partial(), { patch: true });
  try {
    const [p] = await db.update(schema.products).set(d).where(eq(schema.products.id, id)).returning();
    if (!p) throw new HttpError(404, "Product not found.");
    await audit(me.id, "product.updated", "product", id, d);
    return ok({ id: p.id, name: p.name, description: p.description });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(409, "Another product already has that name.");
  }
});
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser("manager");
  const { id } = await params;
  const [p] = await db.delete(schema.products).where(eq(schema.products.id, id)).returning();
  if (p) await audit(me.id, "product.deleted", "product", id, { name: p.name });
  return ok({ deleted: true });
});
