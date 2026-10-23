import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";

export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("manager"); const { id } = await params;
  const [t] = await db.delete(schema.targets).where(eq(schema.targets.id, id)).returning(); if (!t) throw new HttpError(404, "Target not found.");
  await audit(me.id, "target.removed", "target", id, { measure: t.measure }); return ok({ deleted: true });
});
