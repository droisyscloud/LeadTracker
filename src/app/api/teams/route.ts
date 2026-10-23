import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { teamFields } from "./schema";
import { setTeamLinks } from "./save";

export const POST = route(async (req: Request) => {
  const me = await requireUser("manager");
  const d = await body(req, z.object(teamFields).partial().required({ name: true }));
  const [t] = await db.insert(schema.teams).values({ name: d.name, description: d.description || "", notes: d.notes || "", color: d.color || "#4C8DF0", leadId: d.leadId ?? null, target: d.target || 0 }).onConflictDoNothing().returning();
  if (!t) throw new HttpError(409, "A team with that name already exists.");
  const members = new Set(d.memberIds ?? (d.leadId ? [d.leadId] : []));
  if (me.role === "manager") members.add(me.id);
  await setTeamLinks(t.id, [...members], d.productIds ?? []);
  await audit(me.id, "team.created", "team", t.id, { name: t.name });
  return ok({ id: t.id }, 201);
});
