import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Role } from "@/db/schema";
import { audit } from "./audit";
import { practiceMode } from "./config";

const list = (v?: string) => (v || "").split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);

/**
 * Decides whether someone who completed SSO may enter.
 * Order: existing active user, pending invite, bootstrap admin, auto-join domain. Everyone else is refused.
 */
export async function admitUser(p: { email: string; name: string | null; image: string | null }): Promise<"ok" | "NotInvited" | "Disabled"> {
  const email = p.email.toLowerCase();
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing) {
    if (existing.status !== "active") return "Disabled";
    await db.update(schema.users).set({ lastLoginAt: new Date(), name: p.name || existing.name, image: p.image || existing.image }).where(eq(schema.users.id, existing.id));
    return "ok";
  }
  const [invite] = await db.select().from(schema.invites).where(and(eq(schema.invites.email, email), eq(schema.invites.status, "pending"))).limit(1);
  let role: Role | null = null;
  if (invite) role = invite.role;
  else if (list(process.env.BOOTSTRAP_ADMIN_EMAILS).includes(email)) role = "admin";
  else if (list(process.env.AUTO_JOIN_DOMAINS).includes(email.split("@")[1])) role = (process.env.AUTO_JOIN_ROLE as Role) || "viewer";
  else if (practiceMode() && list(process.env.PRACTICE_DOMAINS).includes(email.split("@")[1])) role = "admin";
  if (!role) return "NotInvited";
  const [u] = await db.insert(schema.users).values({ email, name: p.name, image: p.image, role, invitedById: invite?.invitedById ?? null, lastLoginAt: new Date() }).returning();
  if (invite) {
    await db.update(schema.invites).set({ status: "accepted", acceptedAt: new Date() }).where(eq(schema.invites.id, invite.id));
    // join the teams chosen on the invite
    if (invite.teamIds.length) await db.insert(schema.teamMembers).values(invite.teamIds.map((teamId) => ({ teamId, userId: u.id }))).onConflictDoNothing().catch(() => undefined);
  }
  await audit(u.id, invite ? "invite.accepted" : "user.joined", "user", u.id, { role, via: invite ? "invite" : "rule" });
  return "ok";
}
