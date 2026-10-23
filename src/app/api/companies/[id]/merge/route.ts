import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor, requireCompany, requireContact, requireDeal, requireTask } from "@/lib/access";
import { audit } from "@/lib/audit";

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("manager");
  const { id } = await params;
  await requireCompany(me, id);
  const { targetId } = await body(req, z.object({ targetId: z.string().uuid() }));
  if (targetId === id) throw new HttpError(400, "Pick a different company to merge into.");
  const [src] = await db.select().from(schema.companies).where(eq(schema.companies.id, id)).limit(1);
  const [tgt] = await db.select().from(schema.companies).where(eq(schema.companies.id, targetId)).limit(1);
  if (!src || !tgt) throw new HttpError(404, "Company not found.");
  await db.transaction(async (tx) => {
    await tx.update(schema.contacts).set({ companyId: tgt.id, updatedAt: new Date() }).where(eq(schema.contacts.companyId, src.id));
    if (!tgt.website && src.website) await tx.update(schema.companies).set({ website: src.website }).where(eq(schema.companies.id, tgt.id));
    await tx.delete(schema.companies).where(eq(schema.companies.id, src.id));
  });
  await audit(me.id, "company.merged", "company", tgt.id, { from: src.name, into: tgt.name });
  return ok({ merged: true, targetId: tgt.id });
});
