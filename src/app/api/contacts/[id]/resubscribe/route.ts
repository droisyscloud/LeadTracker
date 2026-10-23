import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { requireContact } from "@/lib/access";
import { loadContact } from "@/lib/leads";
import { audit } from "@/lib/audit";

/** Only when the person has asked to hear from us again. Recorded on the timeline and in the audit log. */
export const POST = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("rep");
  const { id } = await params;
  const c = await requireContact(me, id, "write");
  if (!c.unsubscribedAt) throw new HttpError(400, "This lead isn't unsubscribed.");
  await db.update(schema.contacts).set({ unsubscribedAt: null, updatedAt: new Date() }).where(eq(schema.contacts.id, id));
  await db.insert(schema.activities).values({ contactId: id, type: "note", subject: "Opted back in to emails", body: `${me.name || me.email} recorded that ${c.name} asked to receive emails again.`, byId: me.id });
  await audit(me.id, "contact.resubscribed", "contact", id, { name: c.name });
  return ok(await loadContact(id));
});
