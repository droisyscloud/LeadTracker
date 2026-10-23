import { z } from "zod";
import { db, schema } from "@/db";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { stepSchema, seqFields } from "./schema";
export const POST = route(async (req: Request) => {
  const me = await requireUser("manager");
  const d = await body(req, z.object(seqFields).partial({ active: true }));
  const steps = [...d.steps].sort((a, b) => a.dayOffset - b.dayOffset);
  const [row] = await db.insert(schema.sequences).values({ name: d.name, steps, active: d.active ?? true, createdById: me.id }).returning();
  return ok(row, 201);
});
