import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { announce } from "@/lib/chat";
import { appUrl } from "@/lib/config";
import { accessFor, requireCompany, requireContact, requireDeal, requireTask } from "@/lib/access";
import { canManage } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { fireWebhook } from "@/lib/webhooks";
import { dealFields, DEFAULT_PROB } from "../schema";
import { moveToTrash } from "@/lib/trash";
import { requireCap } from "@/lib/permissions";
import { capsFor } from "@/lib/permissions";

type Ctx = { params: Promise<{ id: string }> };
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser("rep");
  const { id } = await params;
  await requireDeal(me, id);
  await requireDeal(me, id);
  const d = await body(req, z.object(dealFields).partial(), { patch: true });
  if (!(await capsFor(me.role)).money) delete (d as { value?: number }).value;
  const [cur] = await db.select().from(schema.deals).where(eq(schema.deals.id, id)).limit(1);
  if (!cur) throw new HttpError(404, "Deal not found.");
  if (!canManage(me.role) && cur.ownerId && cur.ownerId !== me.id) throw new HttpError(403, "Only the owner or a manager can change this deal.");
  if (d.ownerId !== undefined && d.ownerId !== cur.ownerId && !canManage(me.role) && d.ownerId !== me.id) throw new HttpError(403, "Only managers can reassign deals.");
  const set: Record<string, unknown> = { ...d, updatedAt: new Date() };
  if (d.stage && d.stage !== cur.stage) {
    if (d.probability === undefined) set.probability = DEFAULT_PROB[d.stage];
    set.closedAt = d.stage === "won" || d.stage === "lost" ? new Date() : null;
  }
  const [row] = await db.update(schema.deals).set(set).where(eq(schema.deals.id, id)).returning();
  // change history: which fields changed, from what to what
  const changes = (["name", "value", "currency", "stage", "probability", "closeDate", "ownerId", "teamId", "companyId", "contactId", "productId", "outcomeReason"] as const)
    .filter((k) => k in d && String(cur[k] ?? "") !== String(row[k] ?? "")).map((k) => ({ field: k, from: cur[k] ?? null, to: row[k] ?? null }));
  if (changes.length) await audit(me.id, "deal.updated", "deal", id, { name: row.name, changes });
  if (d.stage === "won" && cur.stage !== "won") {
    const [co] = row.companyId ? await db.select({ name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, row.companyId)).limit(1) : [];
    const [owner] = row.ownerId ? await db.select({ name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, row.ownerId)).limit(1) : [];
    await announce("dealWon", `🏆 Deal won: ${row.name}${co ? ` (${co.name})` : ""}, ${row.currency} ${Math.round(row.value).toLocaleString("en-US")}${owner ? `, by ${owner.name || owner.email}` : ""}.${row.outcomeReason ? ` Why we won: ${row.outcomeReason}.` : ""} ${appUrl()}/deals?id=${id}`);
  }
  if (d.stage && d.stage !== cur.stage) await fireWebhook(d.stage === "won" ? "deal.won" : d.stage === "lost" ? "deal.lost" : "deal.stage_changed", { id, name: row.name, value: row.value, from: cur.stage, to: d.stage, reason: row.outcomeReason });
  return ok(row);
});
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser("rep"); await requireCap(me, "delete");
  const { id } = await params;
  const [cur] = await db.select().from(schema.deals).where(eq(schema.deals.id, id)).limit(1);
  if (!cur) throw new HttpError(404, "Deal not found.");
  if (!canManage(me.role) && cur.createdById !== me.id) throw new HttpError(403, "Only managers can delete deals someone else created.");
  const t = await moveToTrash("deal", "deals", id, cur.name, `${cur.currency} ${cur.value.toLocaleString("en-US")} · ${cur.stage}`, me.id);
  await audit(me.id, "deal.deleted", "deal", id, { name: cur.name, value: cur.value });
  return ok({ deleted: true, trashId: t.id });
});
