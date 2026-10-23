import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";

export const POST = route(async (req: Request) => {
  const me = await requireUser("manager");
  const d = await body(req, z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).default(""), notes: z.string().trim().max(10000).default("") }));
  const [p] = await db.insert(schema.products).values(d).onConflictDoNothing().returning();
  if (!p) throw new HttpError(409, "That product already exists.");
  await audit(me.id, "product.created", "product", p.id, { name: p.name });
  return ok({ id: p.id, name: p.name, description: p.description }, 201);
});
