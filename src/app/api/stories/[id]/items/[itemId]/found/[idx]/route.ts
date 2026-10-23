import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { loadStory } from "@/lib/stories";
import { getFile } from "@/lib/storage";
import { callRoute } from "@/lib/selfCall";
import { POST as POST_CONTACT } from "@/app/api/contacts/route";
import { POST as POST_COMPANY } from "@/app/api/companies/route";
import { POST as POST_ACTIVITY } from "@/app/api/activities/route";

type Ctx = { params: Promise<{ id: string; itemId: string; idx: string }> };
/** You decide about someone AI found: add them as a contact (with the card and a "Met at…" note), add their company only, or not now. */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser("rep"); const { id, itemId, idx } = await params; const story = await loadStory(me, id, true);
  const [it] = await db.select().from(schema.storyItems).where(eq(schema.storyItems.id, itemId)).limit(1); if (!it || it.storyId !== id) throw new HttpError(404, "Not found.");
  const n = Number(idx); const person = it.found[n]; if (!person) throw new HttpError(404, "Not found.");
  const d = await body(req, z.object({ action: z.enum(["contact", "company", "dismiss", "link"]), contactId: z.string().uuid().optional(), anyway: z.boolean().optional(), withCompany: z.boolean().default(true), name: z.string().trim().max(200).optional(), title: z.string().trim().max(200).optional(), company: z.string().trim().max(200).optional(),
    email: z.string().trim().max(320).optional(), phone: z.string().trim().max(60).optional(), website: z.string().trim().max(300).optional(), note: z.string().max(5000).optional() }));
  const p = { ...person, ...Object.fromEntries(Object.entries(d).filter(([k, v]) => v !== undefined && !["action", "note", "withCompany", "anyway", "contactId"].includes(k))) } as typeof person;
  // the app's own "add company / add contact / log a note", run directly (same rules)
  const call = async (handler: unknown, opts: { json?: unknown; form?: FormData }) => { const r = await callRoute(handler, req, "POST", opts); if (!r.ok) throw new HttpError(r.status, r.data.error || "Couldn't save that."); return r.data as Record<string, string>; };
  const next = [...it.found];
  if (d.action === "dismiss") next[n] = { ...person, status: "dismissed" };
  else if (d.action === "company") {
    if (!p.company) throw new HttpError(400, "There's no company name to add.");
    const co = await call(POST_COMPANY, { json: { name: p.company, website: p.website || "" } });
    next[n] = { ...p, status: "company", companyId: co.id };
  } else {
    if (!p.name && d.action !== "link") throw new HttpError(400, "Add their name first.");
    // already a contact (same email)? ask before making a second one
    let target: { id: string; companyId?: string | null } | null = null;
    if (d.action === "link") { const [x] = await db.select({ id: schema.contacts.id, companyId: schema.contacts.companyId }).from(schema.contacts).where(eq(schema.contacts.id, d.contactId || "")).limit(1); if (!x) throw new HttpError(404, "That contact isn't there any more."); target = x; }
    else if (p.email && !d.anyway) {
      const all = await db.select({ id: schema.contacts.id, name: schema.contacts.name, email: schema.contacts.email, otherEmails: schema.contacts.otherEmails }).from(schema.contacts);
      const hit = all.find((x) => (x.email || "").toLowerCase() === p.email.toLowerCase() || (x.otherEmails || []).includes(p.email.toLowerCase()));
      if (hit) return ok({ existing: { id: hit.id, name: hit.name } }, 409);
    }
    // the app's normal "add contact" (same rules, duplicate handling, company matching)
    const c = target ?? await call(POST_CONTACT, { json: { name: p.name, title: p.title, company: d.withCompany ? p.company : "", email: p.email, phone: p.phone, website: d.withCompany ? p.website : "", eventId: story.eventId, source: "Booth" } });
    // the card (or photo) and a "Met at…" note on their timeline
    const evName = story.eventId ? (await db.select({ name: schema.events.name }).from(schema.events).where(eq(schema.events.id, story.eventId)).limit(1))[0]?.name : "";
    const fd = new FormData(); fd.append("data", JSON.stringify({ contactId: c.id, type: "note", subject: evName ? `Met at ${evName}` : "From your note", body: [d.note || "", it.kind === "voice" || it.kind === "note" ? it.text : ""].filter(Boolean).join("\n\n") || `From the note "${story.title}".` }));
    if (it.storageKey && (it.kind === "card" || it.kind === "photo")) fd.append("files", new File([new Uint8Array(await getFile(it.storageKey))], it.fileName || `${it.kind}.jpg`, { type: it.contentType || "image/jpeg" }));
    await call(POST_ACTIVITY, { form: fd }).catch((e) => console.error("story note", e));
    next[n] = { ...p, status: "added", contactId: c.id, companyId: c.companyId || undefined };
  }
  await db.update(schema.storyItems).set({ found: next }).where(eq(schema.storyItems.id, itemId));
  const nf = next[n]; if (nf.contactId || nf.companyId) await db.update(schema.stories).set({   // link the note to them
    contactIds: [...new Set([...(story.contactIds || []), ...(nf.contactId ? [nf.contactId] : [])])], companyIds: [...new Set([...(story.companyIds || []), ...(nf.companyId ? [nf.companyId] : [])])] }).where(eq(schema.stories.id, id));
  return ok({ found: next[n] });
});
