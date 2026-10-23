import { desc, inArray, or, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";

/** Your stories (and shared ones), newest first, with what's in each. */
export const GET = route(async (req: Request) => {
  const me = await requireUser("viewer");
  const sp = new URL(req.url).searchParams; const forContact = sp.get("contactId"); const forCompany = sp.get("companyId");
  const rows = await db.select().from(schema.stories).where(me.role === "admin" ? undefined : or(eq(schema.stories.createdById, me.id), eq(schema.stories.shared, true), sql`${schema.stories.sharedWith} @> ${JSON.stringify([me.id])}::jsonb`)).orderBy(desc(schema.stories.updatedAt)).limit(200);
  const items = rows.length ? await db.select({ id: schema.storyItems.id, storyId: schema.storyItems.storyId, kind: schema.storyItems.kind, found: schema.storyItems.found, aiStatus: schema.storyItems.aiStatus, createdAt: schema.storyItems.createdAt }).from(schema.storyItems).where(inArray(schema.storyItems.storyId, rows.map((s) => s.id))) : [];
  // a company's notes include notes about anyone at that company (people you can see)
  let atCompany = new Set<string>();
  if (forCompany) { const { accessFor } = await import("@/lib/access"); const acc = await accessFor(me);
    atCompany = new Set((await db.select({ id: schema.contacts.id }).from(schema.contacts).where(eq(schema.contacts.companyId, forCompany))).map((c) => c.id).filter((id) => acc.canSeeContact(id))); }
  const pick = rows.filter((s) => (!s.draft || (s.createdById === me.id && !forContact && !forCompany))   // drafts: only yours, and never on lead or company pages
    && (!forContact || (s.contactIds || []).includes(forContact))
    && (!forCompany || (s.companyIds || []).includes(forCompany) || (s.contactIds || []).some((x) => atCompany.has(x))));
  return ok({ stories: pick.map((s) => { const its = items.filter((i) => i.storyId === s.id).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const count = (k: string) => its.filter((i) => i.kind === k).length;
    return { id: s.id, title: s.title, eventId: s.eventId, draft: s.draft, people: s.people || [], shared: s.shared, sharedWith: s.sharedWith || [], contactIds: s.contactIds || [], companyIds: s.companyIds || [], mine: s.createdById === me.id, createdById: s.createdById, createdAt: s.createdAt.getTime(), updatedAt: s.updatedAt.getTime(),
      reading: its.filter((i) => i.aiStatus === "pending").length, photos: count("photo"), cards: count("card"), voice: count("voice"), notes: count("note"), pending: its.reduce((n, i) => n + i.found.filter((f) => f.status === "new").length, 0),
      thumbs: its.filter((i) => i.kind === "photo" || i.kind === "card").slice(-4).map((i) => `/api/stories/${s.id}/items/${i.id}/file`) }; }) });
});
export const POST = route(async (req: Request) => {
  const me = await requireUser("rep");
  const d = await body(req, z.object({ title: z.string().trim().min(1).max(200), eventId: z.string().uuid().nullable().default(null), draft: z.boolean().default(false),
    people: z.array(z.object({ name: z.string().trim().min(1).max(200), email: z.string().trim().max(320).optional(), phone: z.string().trim().max(60).optional(), company: z.string().trim().max(200).optional(), title: z.string().trim().max(200).optional(), source: z.enum(["google", "phone"]) })).max(20).default([]) }));
  const [s] = await db.insert(schema.stories).values({ title: d.title, eventId: d.eventId, draft: d.draft, people: d.people, createdById: me.id }).returning();
  return ok({ id: s.id, title: s.title }, 201);
});
