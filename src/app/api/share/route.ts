import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { emailOwner } from "@/lib/emailPrivacy";
import { addNotifications } from "@/lib/notify";
import { audit } from "@/lib/audit";

/**
 * Share a note or an email: only me, everyone on the team, or specific people (by email address).
 * People not in the app yet are listed back, so they can be added first.
 */
export const POST = route(async (req: Request) => {
  const me = await requireUser("viewer");
  const d = await body(req, z.object({ entity: z.enum(["note", "email", "activity"]), id: z.string().uuid(), mode: z.enum(["private", "team", "people"]), emails: z.array(z.string().trim().toLowerCase()).max(50).default([]) }));
  let ids: string[] = []; let added: string[] = [];
  if (d.mode === "people") {
    const wanted = [...new Set(d.emails.filter((e) => e.includes("@")))]; if (!wanted.length) throw new HttpError(400, "Add at least one email address.");
    const users = await db.select({ id: schema.users.id, email: schema.users.email, status: schema.users.status }).from(schema.users).where(inArray(schema.users.email, wanted));
    const missing = wanted.filter((e) => !users.some((u) => u.email.toLowerCase() === e && u.status === "active"));
    if (missing.length) return ok({ missing }, 422);
    ids = users.map((u) => u.id).filter((x) => x !== me.id);
  }
  let link = "", what = "", prev: string[] = [];
  if (d.entity === "note") {
    const [s] = await db.select().from(schema.stories).where(eq(schema.stories.id, d.id)).limit(1);
    if (!s || (s.createdById !== me.id && me.role !== "admin")) throw new HttpError(403, "Only the person who made this note can share it.");
    prev = s.sharedWith || []; await db.update(schema.stories).set({ shared: d.mode === "team", sharedWith: ids }).where(eq(schema.stories.id, d.id));
    link = `/notes?id=${d.id}`; what = `the note "${s.title}"`;
  } else if (d.entity === "activity") {
    // any entry on a lead's timeline (call, note, meeting notes, file…); emails keep their own rules
    const [a] = await db.select().from(schema.activities).where(eq(schema.activities.id, d.id)).limit(1);
    if (!a) throw new HttpError(404, "Not found.");
    const isMail = a.type === "email" || a.type === "reply";
    if (isMail) { if (emailOwner(a) !== me.id) throw new HttpError(403, "Only the person who sent or received this email can share it."); }
    else { const { accessFor } = await import("@/lib/access"); const acc = await accessFor(me);
      if (!acc.canSeeContact(a.contactId)) throw new HttpError(404, "Not found.");
      if (a.byId !== me.id && me.role !== "admin" && me.role !== "manager") throw new HttpError(403, "Only the person who added this (or a manager) can share it."); }
    prev = a.sharedWith || [];
    await db.update(schema.activities).set(isMail ? { shared: d.mode === "team", sharedWith: ids } : { sharedWith: d.mode === "people" ? ids : [] }).where(eq(schema.activities.id, d.id));
    const KIND: Record<string, string> = { call: "a call log", note: "a note", meeting: "meeting notes", file: "a file", email: "an email", reply: "an email" };
    link = `/contacts?id=${a.contactId}`; what = `${KIND[a.type] || "an entry"}${a.subject ? ` ("${a.subject.slice(0, 60)}")` : ""}`;
  } else {
    const [a] = await db.select().from(schema.activities).where(eq(schema.activities.id, d.id)).limit(1);
    if (!a) throw new HttpError(404, "Not found."); if (emailOwner(a) !== me.id) throw new HttpError(403, "Only the person who sent or received this email can share it.");
    prev = a.sharedWith || []; await db.update(schema.activities).set({ shared: d.mode === "team", sharedWith: ids }).where(eq(schema.activities.id, d.id));
    what = `an email${a.subject ? ` ("${a.subject.slice(0, 60)}")` : ""}`;
    link = `/contacts?id=${a.contactId}`;
  }
  added = ids.filter((x) => !prev.includes(x));
  if (added.length) await addNotifications(added.map((userId) => ({ userId, kind: "tagged" as const, text: `${me.name || me.email} shared ${what} with you`, link })));
  await audit(me.id, `${d.entity}.shared`, d.entity === "note" ? "story" : "activity", d.id, { mode: d.mode, people: ids.length });
  return ok({ mode: d.mode, sharedWith: ids });
});
