import { desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { reportDef, schedule } from "@/lib/reportInput";

const dto = (r: typeof schema.reports.$inferSelect) => ({ ...r, createdAt: r.createdAt.getTime(), updatedAt: r.updatedAt.getTime(), lastSentAt: r.lastSentAt?.getTime() ?? null });
/** My saved reports and the ones shared with the team. */
export const GET = route(async () => {
  const me = await requireUser("viewer");
  const rows = await db.select().from(schema.reports).where(or(eq(schema.reports.ownerId, me.id), eq(schema.reports.shared, true))).orderBy(desc(schema.reports.updatedAt));
  return ok({ reports: rows.map(dto) });
});
export const POST = route(async (req: Request) => {
  const me = await requireUser("viewer");
  const d = await body(req, z.object({ name: z.string().trim().min(1).max(120), def: reportDef, shared: z.boolean().default(false), schedule: schedule.default(null) }));
  const [r] = await db.insert(schema.reports).values({ ...d, ownerId: me.id }).returning();
  return ok(dto(r), 201);
});
