import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { accessFor } from "@/lib/access";
import { requireUser } from "@/lib/session";
import { loadStory } from "@/lib/stories";
import { deleteFile } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };
export const itemDTO = (storyId: string, i: typeof schema.storyItems.$inferSelect) => ({ id: i.id, kind: i.kind, text: i.text, found: i.found, aiStatus: i.aiStatus, fileName: i.fileName, contentType: i.contentType,
  url: i.storageKey ? `/api/stories/${storyId}/items/${i.id}/file` : null, createdById: i.createdById, createdAt: i.createdAt.getTime(), editedAt: i.editedAt?.getTime() ?? null });
export const GET = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser("viewer"); const { id } = await params; const s = await loadStory(me, id);
  const items = await db.select().from(schema.storyItems).where(eq(schema.storyItems.storyId, id)).orderBy(asc(schema.storyItems.createdAt));
  return ok({ id: s.id, title: s.title, eventId: s.eventId, draft: s.draft, people: s.people || [], shared: s.shared, sharedWith: s.sharedWith || [], contactIds: s.contactIds || [], companyIds: s.companyIds || [], mine: s.createdById === me.id, createdAt: s.createdAt.getTime(), summary: s.summary ?? null, items: items.map((i) => itemDTO(id, i)) });
});
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser("rep"); const { id } = await params; await loadStory(me, id, true);
  const d = await body(req, z.object({ title: z.string().trim().min(1).max(200).optional(), eventId: z.string().uuid().nullable().optional(), shared: z.boolean().optional(),
    draft: z.literal(false).optional(),
    people: z.array(z.object({ name: z.string().trim().min(1).max(200), email: z.string().trim().max(320).optional(), phone: z.string().trim().max(60).optional(), company: z.string().trim().max(200).optional(), title: z.string().trim().max(200).optional(), source: z.enum(["google", "phone"]) })).max(20).optional(),   // "Save note": a draft becomes a normal note (never the other way)
    contactIds: z.array(z.string().uuid()).max(100).optional(), companyIds: z.array(z.string().uuid()).max(100).optional() }));
  if (d.contactIds || d.companyIds) { const acc = await accessFor(me);   // link only leads and companies you can see
    for (const x of d.contactIds || []) if (!acc.canSeeContact(x)) throw new HttpError(404, "Lead not found.");
    for (const x of d.companyIds || []) if (!acc.canSeeCompany(x)) throw new HttpError(404, "Company not found.");
    if (d.contactIds) d.contactIds = [...new Set(d.contactIds)]; if (d.companyIds) d.companyIds = [...new Set(d.companyIds)]; }
  const [s] = await db.update(schema.stories).set({ ...d, updatedAt: new Date() }).where(eq(schema.stories.id, id)).returning(); return ok({ id: s.id, title: s.title, eventId: s.eventId, shared: s.shared, draft: s.draft });
});
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser("rep"); const { id } = await params; await loadStory(me, id, true);
  const items = await db.select({ k: schema.storyItems.storageKey }).from(schema.storyItems).where(eq(schema.storyItems.storyId, id));
  await db.delete(schema.stories).where(eq(schema.stories.id, id)); for (const i of items) if (i.k) await deleteFile(i.k).catch(() => undefined);
  return ok({ deleted: true });
});
