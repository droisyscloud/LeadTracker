import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";

/** Set (or replace) a target for a person or team. Managers and admins. */
export const POST = route(async (req: Request) => {
  const me = await requireUser("manager");
  const d = await body(req, z.object({ scope: z.enum(["user", "team"]), userId: z.string().uuid().nullable().default(null), teamId: z.string().uuid().nullable().default(null),
    measure: z.enum(["won_value", "won_deals", "meetings", "new_leads", "collected"]), period: z.enum(["month", "quarter"]), amount: z.number().min(0).max(1e10) }));
  if ((d.scope === "user" && !d.userId) || (d.scope === "team" && !d.teamId)) throw new HttpError(400, "Choose who the target is for.");
  const who = d.scope === "user" ? eq(schema.targets.userId, d.userId!) : eq(schema.targets.teamId, d.teamId!);
  await db.delete(schema.targets).where(and(eq(schema.targets.scope, d.scope), who, eq(schema.targets.measure, d.measure), eq(schema.targets.period, d.period), d.scope === "user" ? isNull(schema.targets.teamId) : isNull(schema.targets.userId)));
  const [t] = await db.insert(schema.targets).values({ ...d, userId: d.scope === "user" ? d.userId : null, teamId: d.scope === "team" ? d.teamId : null, createdById: me.id }).returning();
  await audit(me.id, "target.set", "target", t.id, { measure: d.measure, period: d.period, amount: d.amount });
  return ok({ ...t, createdAt: t.createdAt.getTime() }, 201);
});
