import { z } from "zod";
import { db, schema } from "@/db";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";

/** Save the current filters on Contacts or Deals as a named view, for yourself or the whole team. */
export const POST = route(async (req: Request) => {
  const me = await requireUser("viewer");
  const d = await body(req, z.object({ page: z.enum(["contacts", "deals"]), name: z.string().trim().min(1).max(60), filters: z.record(z.string(), z.string().max(200)), shared: z.boolean().default(false) }));
  const [v] = await db.insert(schema.savedViews).values({ ...d, shared: d.shared && me.role !== "viewer", createdById: me.id }).returning();
  return ok({ id: v.id }, 201);
});
