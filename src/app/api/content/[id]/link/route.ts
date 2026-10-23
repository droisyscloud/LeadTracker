import { randomBytes } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor } from "@/lib/access";
import { appUrl } from "@/lib/config";

/** A tracked link to a document for one lead (or a general one). The same lead gets the same link again. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("rep"); const { id } = await params;
  const d = await body(req, z.object({ contactId: z.string().uuid().nullable().default(null) }));
  const [doc] = await db.select().from(schema.content).where(eq(schema.content.id, id)).limit(1);
  if (!doc) throw new HttpError(404, "Document not found.");
  if (d.contactId) { const acc = await accessFor(me); if (!acc.canSeeContact(d.contactId)) throw new HttpError(404, "Lead not found."); }
  const [have] = await db.select().from(schema.contentLinks).where(and(eq(schema.contentLinks.contentId, id), d.contactId ? eq(schema.contentLinks.contactId, d.contactId) : isNull(schema.contentLinks.contactId))).limit(1);
  const link = have || (await db.insert(schema.contentLinks).values({ contentId: id, contactId: d.contactId, token: randomBytes(18).toString("base64url"), createdById: me.id }).returning())[0];
  return ok({ url: `${appUrl()}/v/${link.token}`, name: doc.name });
});
