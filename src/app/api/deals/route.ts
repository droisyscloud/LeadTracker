import { eq } from "drizzle-orm";
import { z } from "zod";
import { defaultTeam } from "@/lib/teams";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor, requireCompany, requireContact, requireDeal, requireTask } from "@/lib/access";
import { fireWebhook } from "@/lib/webhooks";
import { dealFields, DEFAULT_PROB } from "./schema";
import { audit } from "@/lib/audit";
import { capsFor } from "@/lib/permissions";

const input = z.object({ ...dealFields, value: dealFields.value.default(0), currency: dealFields.currency.default("USD"), stage: dealFields.stage.default("qualify"),
  probability: dealFields.probability.optional(), companyId: dealFields.companyId.default(null), contactId: dealFields.contactId.default(null), productId: dealFields.productId.default(null),
  ownerId: dealFields.ownerId.optional(), teamId: dealFields.teamId.optional(), closeDate: dealFields.closeDate.default(null), outcomeReason: dealFields.outcomeReason.default(null), outcomeNote: dealFields.outcomeNote.default("") });

export const POST = route(async (req: Request) => {
  const me = await requireUser("rep");
  const acc = await accessFor(me);
  const d = await body(req, input);
  if (!(await capsFor(me.role)).money) delete (d as { value?: number }).value;
  if (d.contactId && !acc.canSeeContact(d.contactId)) throw new HttpError(404, "Lead not found.");
  if (d.companyId && !acc.canSeeCompany(d.companyId)) throw new HttpError(404, "Company not found.");
  let teamId = d.teamId;
  if (teamId === undefined) {
    const [c] = d.contactId && acc.canSeeContact(d.contactId) ? await db.select({ t: schema.contacts.teamId }).from(schema.contacts).where(eq(schema.contacts.id, d.contactId)).limit(1) : [];
    teamId = c?.t ?? (await defaultTeam(d.ownerId ?? me.id));
  }
  const [row] = await db.insert(schema.deals).values({ ...d, teamId, probability: d.probability ?? DEFAULT_PROB[d.stage], ownerId: d.ownerId === undefined ? me.id : d.ownerId, createdById: me.id,
    closedAt: d.stage === "won" || d.stage === "lost" ? new Date() : null }).returning();
  await audit(me.id, "deal.created", "deal", row.id, { name: row.name, value: row.value, stage: row.stage });
  await fireWebhook("deal.created", { id: row.id, name: row.name, value: row.value, stage: row.stage, companyId: row.companyId });
  return ok(row, 201);
});
