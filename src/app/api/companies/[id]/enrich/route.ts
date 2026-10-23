import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor, requireCompany, requireContact, requireDeal, requireTask } from "@/lib/access";
import { companyDTO } from "@/lib/leads";
import { enrichCompany } from "@/lib/enrich";

export const POST = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("rep");
  const { id } = await params;
  await requireCompany(me, id);
  const [co] = await db.select().from(schema.companies).where(eq(schema.companies.id, id)).limit(1);
  if (!co) throw new HttpError(404, "Company not found.");
  if (!co.website) throw new HttpError(400, "Add the company website first.");
  let info;
  try { info = await enrichCompany(co.name, co.website); } catch (e) { throw new HttpError(502, `Could not read ${co.website}: ${e instanceof Error ? e.message : "unknown error"}`); }
  const [row] = await db.update(schema.companies).set({
    description: co.description || info.description, industry: co.industry || info.industry, location: co.location || info.location, enrichedAt: new Date(),
  }).where(eq(schema.companies.id, id)).returning();
  return ok(companyDTO(row));
});
