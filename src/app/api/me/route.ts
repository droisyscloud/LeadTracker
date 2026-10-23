import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { userDTO } from "@/lib/leads";

const validZone = (t: string) => { try { new Intl.DateTimeFormat("en-US", { timeZone: t }); return true; } catch { return false; } };
export const PATCH = route(async (req: Request) => {
  const me = await requireUser("viewer");
  const d = await body(req, z.object({ digestOptIn: z.boolean(), timezone: z.string().max(64).refine(validZone, "Unknown time zone") }).partial(), { patch: true });
  const [u] = await db.update(schema.users).set(d).where(eq(schema.users.id, me.id)).returning();
  return ok(userDTO(u));
});
