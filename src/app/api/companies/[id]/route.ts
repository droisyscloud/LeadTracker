import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor, requireCompany, requireContact, requireDeal, requireTask } from "@/lib/access";
import { companyDTO } from "@/lib/leads";
import { cleanWebsite, companyKey } from "@/lib/normalize";
import { audit } from "@/lib/audit";
import { moveToTrash } from "@/lib/trash";
import { requireCap } from "@/lib/permissions";

type Ctx = { params: Promise<{ id: string }> };
const patch = z.object({ name: z.string().trim().min(1).max(200), website: z.string().trim().max(300), notes: z.string().max(5000), description: z.string().max(2000), industry: z.string().max(120), location: z.string().max(200), employees: z.string().max(60) }).partial();

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser("rep");
  const { id } = await params;
  await requireCompany(me, id);
  const d = await body(req, patch);
  const set: Partial<typeof schema.companies.$inferInsert> = {};
  if (d.name !== undefined) {
    const key = companyKey(d.name);
    const [clash] = await db.select().from(schema.companies).where(and(eq(schema.companies.nameKey, key), ne(schema.companies.id, id))).limit(1);
    if (clash) throw new HttpError(409, `${clash.name} already exists. Use Merge to combine the two companies.`);
    set.name = d.name; set.nameKey = key;
  }
  if (d.website !== undefined) set.website = cleanWebsite(d.website);
  for (const k of ["notes", "description", "industry", "location", "employees"] as const) if (d[k] !== undefined) set[k] = d[k];
  const [c] = await db.update(schema.companies).set(set).where(eq(schema.companies.id, id)).returning();
  if (!c) throw new HttpError(404, "Company not found.");
  await audit(me.id, "company.updated", "company", id, d);
  return ok(companyDTO(c));
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser("manager"); await requireCap(me, "delete");
  const { id } = await params;
  await requireCompany(me, id);
  const people = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(eq(schema.contacts.companyId, id)).limit(1);
  if (people.length) throw new HttpError(409, "Move or merge the people at this company before deleting it.");
  const [co] = await db.select().from(schema.companies).where(eq(schema.companies.id, id)).limit(1);
  const t = await moveToTrash("company", "companies", id, co?.name || "Company", co?.website || "", me.id);
  await audit(me.id, "company.deleted", "company", id, { name: co?.name });
  return ok({ deleted: true, trashId: t.id });
});
