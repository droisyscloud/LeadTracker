import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { syncMailbox } from "@/lib/mailsync";
import { audit } from "@/lib/audit";

export const maxDuration = 120;
/** Add a suggested person as a contact at their company (then pull in their past emails), or dismiss them. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("rep"); const { id } = await params;
  const d = await body(req, z.object({ action: z.enum(["add", "dismiss"]), name: z.string().trim().max(200).optional(), title: z.string().trim().max(200).optional() }));
  const [s] = await db.select().from(schema.contactSuggestions).where(eq(schema.contactSuggestions.id, id)).limit(1); if (!s?.companyId) throw new HttpError(404, "Not found.");
  if (d.action === "dismiss") { await db.update(schema.contactSuggestions).set({ status: "dismissed" }).where(eq(schema.contactSuggestions.id, id)); return ok({ dismissed: true }); }
  const [dupe] = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(eq(schema.contacts.email, s.email)).limit(1);
  const name = (d.name || s.name || s.email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (x) => x.toUpperCase())).slice(0, 200);
  const contactId = dupe?.id ?? (await db.insert(schema.contacts).values({ name, title: d.title || "", email: s.email, companyId: s.companyId!, ownerId: me.id, createdById: me.id, source: "Email" } as typeof schema.contacts.$inferInsert).returning())[0].id;
  await db.update(schema.contactSuggestions).set({ status: "added" }).where(eq(schema.contactSuggestions.id, id));
  await audit(me.id, "contact.created", "contact", contactId, { name, from: "email suggestion" });
  // pull in their past emails from your mailbox (others' mailboxes catch up on their next sync)
  let logged = 0; const [conn] = await db.select().from(schema.connections).where(eq(schema.connections.userId, me.id)).limit(1);
  if (conn) logged = (await syncMailbox(conn as never, { refresh: true, since: new Date(Date.now() - 180 * 86400_000) }).catch(() => ({ logged: 0 }))).logged;
  return ok({ contactId, emailsLogged: logged }, 201);
});
