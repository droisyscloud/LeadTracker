import { decodeEntities } from "./text";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ActivityDTO, CompanyDTO, ContactDTO, InviteDTO, UserDTO } from "./types";
import { cleanWebsite, companyKey } from "./normalize";
import { appUrl } from "./config";

const ms = (d: Date | null | undefined) => (d ? d.getTime() : null);

export function userDTO(u: typeof schema.users.$inferSelect): UserDTO {
  return { id: u.id, email: u.email, name: u.name, image: u.image, role: u.role, status: u.status, createdAt: u.createdAt.getTime(), lastLoginAt: ms(u.lastLoginAt), digestOptIn: u.digestOptIn, timezone: u.timezone };
}
export function inviteDTO(i: typeof schema.invites.$inferSelect): InviteDTO {
  return { id: i.id, email: i.email, role: i.role, status: i.status, invitedById: i.invitedById, createdAt: i.createdAt.getTime(), lastSentAt: ms(i.lastSentAt), teamIds: i.teamIds, link: `${appUrl()}/login?invite=${encodeURIComponent(i.token)}` };
}
export function companyDTO(c: typeof schema.companies.$inferSelect): CompanyDTO {
  return { id: c.id, name: c.name, website: c.website, notes: c.notes, description: c.description, industry: c.industry, location: c.location, employees: c.employees, enrichedAt: ms(c.enrichedAt), crmId: c.crmId, createdAt: c.createdAt.getTime() };
}
export function contactDTO(c: typeof schema.contacts.$inferSelect, productIds: string[]): ContactDTO {
  return {
    id: c.id, name: c.name, title: c.title, email: c.email, otherEmails: c.otherEmails || [], otherPhones: c.otherPhones || [], followupDismissedOn: c.followupDismissedOn ?? null, linkedinUrl: c.linkedinUrl || "", background: c.background || "", phone: c.phone, companyId: c.companyId,
    status: c.status, tags: c.tags, rating: c.rating, ownerId: c.ownerId, nextFollowUp: c.nextFollowUp, source: c.source, personal: !!c.personal,
    createdById: c.createdById, createdAt: c.createdAt.getTime(), updatedAt: c.updatedAt.getTime(), lastTouchAt: ms(c.lastTouchAt), productIds,
    referredBy: c.referredBy, eventId: c.eventId, teamId: c.teamId, outcomeReason: c.outcomeReason, outcomeNote: c.outcomeNote, crmId: c.crmId, crmSyncedAt: ms(c.crmSyncedAt), unsubscribedAt: ms(c.unsubscribedAt),
  };
}
const PREVIEW = 1200;
export function activityDTO(a: typeof schema.activities.$inferSelect, files: (typeof schema.files.$inferSelect)[], mailFiles: (typeof schema.emailAttachments.$inferSelect)[] = []): ActivityDTO {
  const long = a.body.length > PREVIEW; const shown = long ? a.body.slice(0, PREVIEW) : a.body;
  const preview = a.origin === "sync" && (!a.providerMessageId || a.providerMessageId === "missing") && !a.emailFrom;
  return { ownerId: a.mailboxUserId ?? a.byId ?? null, shared: !!a.shared, sharedWith: a.sharedWith || [], private: false,
    id: a.id, contactId: a.contactId, type: a.type, subject: a.subject, body: preview ? decodeEntities(shown) : shown, truncated: long, hasHtml: !!a.bodyHtml, preview,
    emailFrom: a.emailFrom, emailTo: a.emailTo, emailCc: a.emailCc,
    mailFiles: mailFiles.map((f) => ({ id: f.id, name: f.name, contentType: f.contentType, size: f.size })), outcome: a.outcome, kind: a.kind, done: a.done, bounced: a.bounced,
    meetingAt: ms(a.meetingAt), cancelled: a.cancelled, byId: a.byId, at: a.at.getTime(), delivery: a.delivery, openedAt: ms(a.openedAt), openCount: a.openCount,
    files: files.map((f) => ({ id: f.id, name: f.name, contentType: f.contentType, size: f.size })), origin: a.origin,
    editedAt: ms(a.editedAt), editedById: a.editedById,
  };
}

/** Find a company by normalized name or create it. Fills in a missing website. */
export async function ensureCompany(name: string, website: string, actorId: string | null): Promise<string | null> {
  const n = name.trim();
  if (!n) return null;
  const key = companyKey(n);
  const web = cleanWebsite(website);
  const [hit] = await db.select().from(schema.companies).where(eq(schema.companies.nameKey, key)).limit(1);
  if (hit) {
    if (web && !hit.website) await db.update(schema.companies).set({ website: web }).where(eq(schema.companies.id, hit.id));
    return hit.id;
  }
  const [c] = await db.insert(schema.companies).values({ name: n, nameKey: key, website: web, createdById: actorId })
    .onConflictDoUpdate({ target: schema.companies.nameKey, set: { nameKey: key } }).returning();
  return c.id;
}

export async function setContactProducts(contactId: string, productIds: string[]) {
  await db.delete(schema.contactProducts).where(eq(schema.contactProducts.contactId, contactId));
  const ids = [...new Set(productIds)];
  if (!ids.length) return;
  const valid = await db.select({ id: schema.products.id }).from(schema.products).where(inArray(schema.products.id, ids));
  if (valid.length) await db.insert(schema.contactProducts).values(valid.map((p) => ({ contactId, productId: p.id })));
}

export async function loadContact(id: string): Promise<ContactDTO | null> {
  const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, id)).limit(1);
  if (!c) return null;
  const ps = await db.select().from(schema.contactProducts).where(eq(schema.contactProducts.contactId, id));
  return contactDTO(c, ps.map((p) => p.productId));
}

const RANK = { new: 0, contacted: 1, engaged: 2, meeting: 3, proposal: 4, won: 5, lost: 6 } as const;
export const ADVANCE: Partial<Record<string, keyof typeof RANK>> = { email: "contacted", call: "contacted", reply: "engaged", request: "engaged", meeting: "meeting" };
export function advancedStage(current: keyof typeof RANK, type: string, outcome?: string | null): keyof typeof RANK {
  const target = ADVANCE[type];
  if (!target || current === "won" || current === "lost") return current;
  if (type === "call" && outcome !== "connected" && current !== "new") return current;
  return RANK[current] < RANK[target] ? target : current;
}

export const dealDTO = (d: typeof schema.deals.$inferSelect) => ({ ...d, closedAt: ms(d.closedAt), createdAt: d.createdAt.getTime(), updatedAt: d.updatedAt.getTime() });
export const taskDTO = (t: typeof schema.tasks.$inferSelect) => ({ ...t, doneAt: ms(t.doneAt), createdAt: t.createdAt.getTime(), updatedAt: t.updatedAt.getTime() });
export const eventDTO = (e: typeof schema.events.$inferSelect) => ({ id: e.id, name: e.name, startDate: e.startDate, endDate: e.endDate, location: e.location, cost: e.cost, notes: e.notes });
export const sequenceDTO = (q: typeof schema.sequences.$inferSelect) => ({ id: q.id, name: q.name, steps: q.steps, active: q.active, createdAt: q.createdAt.getTime() });
export const enrollmentDTO = (e: typeof schema.enrollments.$inferSelect) => ({ ...e, nextAt: ms(e.nextAt), enrolledAt: e.enrolledAt.getTime() });
