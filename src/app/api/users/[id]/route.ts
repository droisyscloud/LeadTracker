import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { userDTO } from "@/lib/leads";
import { audit } from "@/lib/audit";

export const PATCH = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("admin");
  const { id } = await params;
  const { teamIds, ...d } = await body(req, z.object({ role: z.enum(["admin", "manager", "rep", "viewer"]), status: z.enum(["active", "disabled"]), teamIds: z.array(z.string().uuid()).max(20) }).partial(), { patch: true });
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!u) throw new HttpError(404, "User not found.");
  if (id === me.id && (d.role && d.role !== "admin" || d.status === "disabled")) throw new HttpError(400, "You cannot remove your own admin access. Ask another admin.");
  if (u.role === "admin" && (d.role && d.role !== "admin" || d.status === "disabled")) {
    const others = await db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.role, "admin"), eq(schema.users.status, "active"), ne(schema.users.id, id)));
    if (!others.length) throw new HttpError(400, "There must be at least one active admin.");
  }
  const [n] = Object.keys(d).length ? await db.update(schema.users).set(d).where(eq(schema.users.id, id)).returning() : [u];
  if (teamIds) {
    // replace this person's team memberships
    await db.delete(schema.teamMembers).where(eq(schema.teamMembers.userId, id));
    const valid = teamIds.length ? (await db.select({ id: schema.teams.id }).from(schema.teams).where(inArray(schema.teams.id, teamIds))).map((t) => t.id) : [];
    if (valid.length) await db.insert(schema.teamMembers).values(valid.map((teamId) => ({ teamId, userId: id }))).onConflictDoNothing();
  }
  await audit(me.id, "user.updated", "user", id, { email: u.email, ...d, ...(teamIds ? { teams: teamIds.length } : {}) });
  return ok(userDTO(n));
});
