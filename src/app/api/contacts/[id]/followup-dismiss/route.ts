import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor } from "@/lib/access";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };
const today = () => new Date().toLocaleDateString("en-CA");
/** Remove this follow-up for me only (everyone else still sees it). */
export const POST = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser("viewer"); const { id } = await params;
  if (!(await accessFor(me)).canSeeContact(id)) throw new HttpError(404, "Lead not found.");
  await db.insert(schema.followupDismissals).values({ userId: me.id, contactId: id, dismissedOn: today() })
    .onConflictDoUpdate({ target: [schema.followupDismissals.userId, schema.followupDismissals.contactId], set: { dismissedOn: today() } });
  await audit(me.id, "followup.removed_for_me", "contact", id, {});
  return ok({ removed: true });
});
/** Bring it back. */
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser("viewer"); const { id } = await params;
  await db.delete(schema.followupDismissals).where(and(eq(schema.followupDismissals.userId, me.id), eq(schema.followupDismissals.contactId, id)));
  return ok({ removed: false });
});
