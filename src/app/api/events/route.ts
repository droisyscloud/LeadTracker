import { z } from "zod";
import { db, schema } from "@/db";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { eventFields } from "./schema";
export const POST = route(async (req: Request) => {
  await requireUser("manager");
  const d = await body(req, z.object(eventFields).partial().required({ name: true }));
  const [row] = await db.insert(schema.events).values(d).returning();
  return ok(row, 201);
});
