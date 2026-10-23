import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { ensureCompany, loadContact, setContactProducts } from "@/lib/leads";
import { cleanEmail, websiteFromEmail } from "@/lib/normalize";
import { contactInput } from "./schema";
import { fireWebhook } from "@/lib/webhooks";
import { defaultTeam } from "@/lib/teams";
import { cleanLinkedIn } from "@/lib/linkedin";

export const POST = route(async (req: Request) => {
  const me = await requireUser("rep");
  const d = await body(req, contactInput.extend({ clientRef: z.string().max(80).optional() }));
  if (d.clientRef) {
    const [dup] = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(eq(schema.contacts.clientRef, d.clientRef)).limit(1);
    if (dup) return ok(await loadContact(dup.id), 200);
  }
  const companyId = await ensureCompany(d.company, d.website || websiteFromEmail(d.email), me.id);
  const [c] = await db.insert(schema.contacts).values({
    name: d.name, title: d.title, email: cleanEmail(d.email), linkedinUrl: cleanLinkedIn(d.linkedinUrl || ""), background: d.background || "", otherPhones: [...new Set((d.otherPhones || []).map((x) => x.trim()).filter(Boolean))], otherEmails: [...new Set((d.otherEmails || []).map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@")))], phone: d.phone, companyId,
    tags: d.tags, ownerId: me.id, createdById: me.id, clientRef: d.clientRef ?? null, source: d.source, referredBy: d.referredBy, eventId: d.eventId, teamId: d.personal ? null : d.teamId ?? (await defaultTeam(me.id)), personal: d.personal,
  }).returning();
  if (!c.personal) await fireWebhook("lead.created", { contactId: c.id, name: c.name, email: c.email, source: c.source });   // personal contacts never leave the app
  await setContactProducts(c.id, d.productIds);
  return ok(await loadContact(c.id), 201);
});
