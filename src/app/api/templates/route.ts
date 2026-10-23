import { z } from "zod";
import { db, schema } from "@/db";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { templateFields } from "./schema";

export const POST = route(async (req: Request) => {
  const me = await requireUser("rep");
  const d = await body(req, z.object(templateFields).partial().required({ name: true }));
  const [t] = await db.insert(schema.emailTemplates).values({ name: d.name, subject: d.subject || "", body: d.body || "", sortOrder: d.sortOrder ?? 500, createdById: me.id, updatedById: me.id }).returning();
  await audit(me.id, "template.created", "template", t.id, { name: t.name });
  return ok({ id: t.id }, 201);
});
