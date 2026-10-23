import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";

/** Mark notifications read: { all: true } or { ids: [...] }. */
export const POST = route(async (req: Request) => {
  const me = await requireUser("viewer");
  const d = await body(req, z.object({ all: z.boolean().default(false), ids: z.array(z.string().uuid()).max(200).default([]) }));
  const mine = and(eq(schema.notifications.userId, me.id), isNull(schema.notifications.readAt));
  if (d.all) await db.update(schema.notifications).set({ readAt: new Date() }).where(mine);
  else if (d.ids.length) await db.update(schema.notifications).set({ readAt: new Date() }).where(and(mine, inArray(schema.notifications.id, d.ids)));
  return ok({ ok: true });
});
