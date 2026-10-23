import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { updateById } from "../../_crud";
import { eventFields } from "../schema";
type Ctx = { params: Promise<{ id: string }> };
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  await requireUser("manager"); const { id } = await params;
  return ok(await updateById(schema.events, id, await body(req, z.object(eventFields).partial(), { patch: true })));
});
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser("manager"); const { id } = await params;
  await db.delete(schema.events).where(eq(schema.events.id, id)); await audit(me.id, "event.deleted", "event", id);
  return ok({ deleted: true });
});
