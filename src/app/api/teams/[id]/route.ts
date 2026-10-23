import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor } from "@/lib/access";
import { audit } from "@/lib/audit";
import { teamFields } from "../schema";
import { setTeamLinks } from "../save";

type Ctx = { params: Promise<{ id: string }> };
async function canEditTeam(id: string) {
  const me = await requireUser("rep");
  const [t] = await db.select().from(schema.teams).where(eq(schema.teams.id, id)).limit(1);
  if (!t) throw new HttpError(404, "Team not found.");
  const isLead = t.leadId === me.id;
  const acc = await accessFor(me);
  if (me.role !== "admin" && !acc.canSeeTeam(id) && !isLead) throw new HttpError(404, "Team not found.");
  if (me.role !== "admin" && me.role !== "manager" && !isLead) throw new HttpError(403, "Only managers or the team lead can change this team.");
  return { me, t, isLead: isLead && me.role !== "admin" && me.role !== "manager" };
}
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const { me, isLead } = await canEditTeam(id);
  const d = await body(req, z.object(teamFields).partial(), { patch: true });
  if (isLead && (d.leadId !== undefined || d.name !== undefined || d.target !== undefined)) throw new HttpError(403, "Team leads can change members and products; managers change the name, lead and target.");
  const { memberIds, productIds, ...rest } = d;
  if (Object.keys(rest).length) {
    try { await db.update(schema.teams).set(rest).where(eq(schema.teams.id, id)); }
    catch { throw new HttpError(409, "A team with that name already exists."); }
  }
  await setTeamLinks(id, memberIds, productIds);
  await audit(me.id, "team.updated", "team", id, { ...rest, members: memberIds?.length, products: productIds?.length });
  return ok({ ok: true });
});
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser("manager");
  const { id } = await params;
  if (me.role !== "admin" && !(await accessFor(me)).canSeeTeam(id)) throw new HttpError(404, "Team not found.");
  const [t] = await db.delete(schema.teams).where(eq(schema.teams.id, id)).returning();
  if (t) await audit(me.id, "team.deleted", "team", id, { name: t.name });
  return ok({ deleted: true });
});
