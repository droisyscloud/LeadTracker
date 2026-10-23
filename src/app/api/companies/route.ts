import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { companyKey } from "@/lib/normalize";
import { ensureCompany } from "@/lib/leads";
import { audit } from "@/lib/audit";

/**
 * Add a company on its own (before anyone there is a lead). If one with the same name already exists
 * (ignoring "Inc", "Ltd", punctuation and case), that one is returned instead of a duplicate.
 */
export const POST = route(async (req: Request) => {
  const me = await requireUser("rep");
  const d = await body(req, z.object({
    name: z.string().trim().min(1).max(200), website: z.string().max(300).default(""), industry: z.string().max(120).default(""),
    location: z.string().max(200).default(""), employees: z.string().max(40).default(""), notes: z.string().max(5000).default(""),
  }));
  const [existing] = await db.select().from(schema.companies).where(eq(schema.companies.nameKey, companyKey(d.name))).limit(1);
  const id = (await ensureCompany(d.name, d.website, me.id))!;
  if (!existing) {
    const extra = { industry: d.industry, location: d.location, employees: d.employees, notes: d.notes };
    if (Object.values(extra).some(Boolean)) await db.update(schema.companies).set(extra).where(eq(schema.companies.id, id));
    await audit(me.id, "company.created", "company", id, { name: d.name });
  }
  return ok({ id, existed: !!existing, name: existing?.name || d.name }, existing ? 200 : 201);
});
