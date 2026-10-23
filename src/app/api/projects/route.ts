import { db, schema } from "@/db";
import { body, ok, route } from "@/lib/http";
import { audit } from "@/lib/audit";
import { requireBillingUser } from "@/lib/collectionsAccess";
import { projectInput } from "@/lib/collectionsInput";

export const POST = route(async (req: Request) => {
  const me = await requireBillingUser(); const d = await body(req, projectInput);
  const [p] = await db.insert(schema.projects).values({ ...d, createdById: me.id }).returning();
  await audit(me.id, "project.created", "project", p.id, { name: p.name });
  return ok({ ...p, createdAt: p.createdAt.getTime() }, 201);
});
