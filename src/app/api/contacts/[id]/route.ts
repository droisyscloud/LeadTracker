import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor, requireCompany, requireContact, requireDeal, requireTask } from "@/lib/access";
import { canManage } from "@/lib/rbac";
import { ensureCompany, loadContact, setContactProducts } from "@/lib/leads";
import { cleanEmail } from "@/lib/normalize";
import { deleteFile } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { contactPatch } from "../schema";
import { cleanLinkedIn } from "@/lib/linkedin";
import { fireWebhook } from "@/lib/webhooks";
import { moveToTrash } from "@/lib/trash";
import { requireCap } from "@/lib/permissions";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser("rep");
  const { id } = await params;
  await requireContact(me, id, "write");
  const cur = await loadContact(id);
  if (!cur) throw new HttpError(404, "Contact not found.");
  const d = await body(req, contactPatch);
  const set: Partial<typeof schema.contacts.$inferInsert> = { updatedAt: new Date() };
  if (d.ownerId !== undefined && d.ownerId !== cur.ownerId && !canManage(me.role)) {
    const claimingFree = !cur.ownerId && d.ownerId === me.id;
    const releasingOwn = cur.ownerId === me.id && d.ownerId === null;
    if (!claimingFree && !releasingOwn) throw new HttpError(403, "Only managers can reassign leads owned by someone else.");
  }
  const raw = d as { personal?: boolean };
  if (raw.personal !== undefined && raw.personal !== cur.personal) {
    if (cur.createdById !== me.id) throw new HttpError(403, "Only the person who added this contact can make it personal or professional.");
    set.personal = raw.personal; if (raw.personal) { set.ownerId = me.id; set.teamId = null; }
  }
  if (cur.personal && (d.ownerId !== undefined && d.ownerId !== me.id)) throw new HttpError(400, "A personal contact stays yours. Make it professional first to give it to someone else.");
  for (const k of ["name", "title", "phone", "tags", "status", "rating", "ownerId", "nextFollowUp", "source", "referredBy", "eventId", "teamId", "outcomeReason", "outcomeNote"] as const) {
    if (d[k] !== undefined) (set as Record<string, unknown>)[k] = d[k];
  }
  if (d.email !== undefined) set.email = cleanEmail(d.email);
  if (d.otherPhones !== undefined) set.otherPhones = [...new Set(d.otherPhones.map((x) => x.trim()).filter(Boolean))];
  if (d.followupDismissedOn !== undefined) set.followupDismissedOn = d.followupDismissedOn;
  if (d.linkedinUrl !== undefined) set.linkedinUrl = cleanLinkedIn(d.linkedinUrl);
  if (d.background !== undefined) set.background = d.background;
  if (d.otherEmails !== undefined) set.otherEmails = [...new Set(d.otherEmails.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@")))];
  if (d.company !== undefined) set.companyId = await ensureCompany(d.company, d.website || "", me.id);
  else if (d.website && cur.companyId) {
    await db.update(schema.companies).set({ website: d.website.replace(/^https?:\/\//i, "").replace(/\/+$/, "") }).where(eq(schema.companies.id, cur.companyId));
  }
  await db.update(schema.contacts).set(set).where(eq(schema.contacts.id, id));
  const lch = (["status", "ownerId", "rating", "teamId"] as const).filter((k) => k in set && String((cur as Record<string, unknown>)[k] ?? "") !== String((set as Record<string, unknown>)[k] ?? ""))
    .map((k) => ({ field: k, from: (cur as Record<string, unknown>)[k] ?? null, to: (set as Record<string, unknown>)[k] ?? null }));
  if (lch.length) await audit(me.id, "contact.updated", "contact", id, { name: cur.name, changes: lch });
  if (d.productIds) await setContactProducts(id, d.productIds);
  if (d.status && d.status !== cur.status) await fireWebhook("contact.stage_changed", { contactId: id, from: cur.status, to: d.status, reason: d.outcomeReason ?? null });
  if (d.ownerId !== undefined && d.ownerId !== cur.ownerId) await audit(me.id, "contact.reassigned", "contact", id, { from: cur.ownerId, to: d.ownerId });
  return ok(await loadContact(id));
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser("rep"); await requireCap(me, "delete");
  const { id } = await params;
  await requireContact(me, id, "write");
  const cur = await loadContact(id);
  if (!cur) throw new HttpError(404, "Contact not found.");
  if (!canManage(me.role) && cur.createdById !== me.id) throw new HttpError(403, "Only managers can delete leads someone else added.");
  // to the recycle bin, with its timeline, files and links (restorable for 30 days)
  const [co] = cur.companyId ? await db.select({ name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, cur.companyId)).limit(1) : [];
  const t = await moveToTrash("contact", "contacts", id, cur.name, [cur.title, co?.name, cur.email].filter(Boolean).join(" · "), me.id);
  await audit(me.id, "contact.deleted", "contact", id, { name: cur.name });
  return ok({ deleted: true, trashId: t.id });
});
