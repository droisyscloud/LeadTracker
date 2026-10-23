import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor } from "@/lib/access";
import { canManage } from "@/lib/rbac";

/** Put leads into this team (or remove them with remove: true). Optionally move their open deals too. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("rep");
  const { id } = await params;
  const [t] = await db.select().from(schema.teams).where(eq(schema.teams.id, id)).limit(1);
  if (!t) throw new HttpError(404, "Team not found.");
  if (!canManage(me.role) && t.leadId !== me.id) throw new HttpError(403, "Only managers or the team lead can assign leads to this team.");
  const d = await body(req, z.object({ contactIds: z.array(z.string().uuid()).min(1).max(1000), remove: z.boolean().default(false), includeDeals: z.boolean().default(true) }));
  const acc = await accessFor(me);
  if (me.role !== "admin" && !acc.canSeeTeam(id) && t.leadId !== me.id) throw new HttpError(404, "Team not found.");
  for (const cid of d.contactIds) if (!acc.canEditContact(cid)) throw new HttpError(404, "Lead not found.");
  const teamId = d.remove ? null : id;
  await db.update(schema.contacts).set({ teamId, updatedAt: new Date() }).where(inArray(schema.contacts.id, d.contactIds));
  if (d.includeDeals) await db.update(schema.deals).set({ teamId, updatedAt: new Date() }).where(inArray(schema.deals.contactId, d.contactIds));
  return ok({ updated: d.contactIds.length });
});
