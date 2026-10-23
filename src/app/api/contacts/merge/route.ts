import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor, requireCompany, requireContact, requireDeal, requireTask } from "@/lib/access";
import { audit } from "@/lib/audit";
import { loadContact } from "@/lib/leads";

export const POST = route(async (req: Request) => {
  const me = await requireUser("manager");
  const d = await body(req, z.object({ primaryId: z.string().uuid(), duplicateIds: z.array(z.string().uuid()).min(1).max(20) }));
  const dupIds = d.duplicateIds.filter((x) => x !== d.primaryId);
  const acc = await accessFor(me);
  for (const cid of [d.primaryId, ...dupIds]) await requireContact(me, cid, "write", acc);
  const [p] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, d.primaryId)).limit(1);
  const dups = await db.select().from(schema.contacts).where(inArray(schema.contacts.id, dupIds));
  if (!p || dups.length !== dupIds.length) throw new HttpError(404, "Contact not found.");
  await db.transaction(async (tx) => {
    const fill: Record<string, unknown> = {};
    for (const k of ["title", "email", "phone", "referredBy", "source"] as const) if (!p[k]) { const v = dups.find((x) => x[k])?.[k]; if (v) fill[k] = v; }
    if (!p.companyId) { const v = dups.find((x) => x.companyId)?.companyId; if (v) fill.companyId = v; }
    if (!p.ownerId) { const v = dups.find((x) => x.ownerId)?.ownerId; if (v) fill.ownerId = v; }
    if (!p.eventId) { const v = dups.find((x) => x.eventId)?.eventId; if (v) fill.eventId = v; }
    fill.tags = [...new Set([...p.tags, ...dups.flatMap((x) => x.tags)])];
    fill.rating = Math.max(p.rating, ...dups.map((x) => x.rating));
    const touches = [p.lastTouchAt, ...dups.map((x) => x.lastTouchAt)].filter(Boolean) as Date[];
    if (touches.length) fill.lastTouchAt = new Date(Math.max(...touches.map((t) => t.getTime())));
    fill.updatedAt = new Date();
    await tx.update(schema.contacts).set(fill).where(eq(schema.contacts.id, p.id));
    await tx.update(schema.activities).set({ contactId: p.id }).where(inArray(schema.activities.contactId, dupIds));
    await tx.update(schema.tasks).set({ contactId: p.id }).where(inArray(schema.tasks.contactId, dupIds));
    await tx.update(schema.deals).set({ contactId: p.id }).where(inArray(schema.deals.contactId, dupIds));
    await tx.update(schema.enrollments).set({ contactId: p.id }).where(inArray(schema.enrollments.contactId, dupIds));
    const prods = await tx.select().from(schema.contactProducts).where(inArray(schema.contactProducts.contactId, [p.id, ...dupIds]));
    await tx.delete(schema.contactProducts).where(inArray(schema.contactProducts.contactId, [p.id, ...dupIds]));
    const uniq = [...new Set(prods.map((x) => x.productId))];
    if (uniq.length) await tx.insert(schema.contactProducts).values(uniq.map((productId) => ({ contactId: p.id, productId })));
    await tx.delete(schema.contacts).where(inArray(schema.contacts.id, dupIds));
    // keep every address the person used, so future emails and meetings with any of them land on this contact
    const keep = [...new Set([...(p.otherEmails || []), ...dups.flatMap((x) => [x.email, ...(x.otherEmails || [])])].map((e) => (e || "").trim().toLowerCase()).filter((e) => e && e.includes("@") && e !== (p.email || "").toLowerCase()))];
    await tx.update(schema.contacts).set({ otherEmails: keep, ...(!p.email && keep[0] ? { email: keep[0], otherEmails: keep.slice(1) } : {}) }).where(eq(schema.contacts.id, p.id));
  });
  await audit(me.id, "contact.merged", "contact", p.id, { name: p.name, merged: dups.map((x) => x.name) });
  return ok(await loadContact(p.id));
});
