import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { updateById } from "../../_crud";
import { seqFields } from "../schema";
type Ctx = { params: Promise<{ id: string }> };
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  await requireUser("manager"); const { id } = await params;
  const d = await body(req, z.object(seqFields).partial(), { patch: true });
  return ok(await updateById(schema.sequences, id, d.steps ? { ...d, steps: [...d.steps].sort((a, b) => a.dayOffset - b.dayOffset) } : d));
});
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser("manager"); const { id } = await params;
  await db.delete(schema.sequences).where(eq(schema.sequences.id, id)); await audit(me.id, "sequence.deleted", "sequence", id);
  return ok({ deleted: true });
});
