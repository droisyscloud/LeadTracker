import { randomBytes } from "crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { appUrl } from "@/lib/config";

export const dashDTO = (d: typeof schema.dashboards.$inferSelect) => ({ id: d.id, name: d.name, reportIds: d.reportIds, linkOn: d.linkOn, url: `${appUrl()}/d/${d.token}`, createdAt: d.createdAt.getTime() });
export const GET = route(async () => {
  const me = await requireUser("viewer");
  const rows = await db.select().from(schema.dashboards).where(eq(schema.dashboards.ownerId, me.id)).orderBy(desc(schema.dashboards.createdAt));
  return ok({ dashboards: rows.map(dashDTO) });
});
export const POST = route(async (req: Request) => {
  const me = await requireUser("viewer");
  const d = await body(req, z.object({ name: z.string().trim().min(1).max(120), reportIds: z.array(z.string().uuid()).min(1).max(12) }));
  const [r] = await db.insert(schema.dashboards).values({ ...d, ownerId: me.id, token: randomBytes(24).toString("base64url") }).returning();
  return ok(dashDTO(r), 201);
});
