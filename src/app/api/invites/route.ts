import { randomBytes } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { inviteDTO } from "@/lib/leads";
import { mailConfigured } from "@/lib/config";
import { sendInvite } from "@/lib/mail";
import { ROLE_INFO } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const input = z.object({ emails: z.array(z.string().trim().toLowerCase().email()).min(1).max(50), role: z.enum(["admin", "manager", "rep", "viewer"]), teamIds: z.array(z.string().uuid()).max(20).default([]) });

export const POST = route(async (req: Request) => {
  const me = await requireUser("admin");
  const d = await body(req, input);
  // only real teams
  const teamIds = d.teamIds.length ? (await db.select({ id: schema.teams.id }).from(schema.teams).where(inArray(schema.teams.id, d.teamIds))).map((t) => t.id) : [];
  const results: { email: string; status: "invited" | "already-member"; emailed: boolean; link?: string; error?: string }[] = [];
  for (const email of [...new Set(d.emails)]) {
    const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (u) { results.push({ email, status: "already-member", emailed: false }); continue; }
    const token = randomBytes(24).toString("base64url");
    const [inv] = await db.insert(schema.invites).values({ email, role: d.role, token, invitedById: me.id, lastSentAt: new Date(), teamIds })
      .onConflictDoUpdate({ target: schema.invites.email, set: { role: d.role, token, status: "pending", invitedById: me.id, lastSentAt: new Date(), teamIds } }).returning();
    let emailed = false, error: string | undefined;
    if (mailConfigured()) {
      try { await sendInvite({ to: email, roleLabel: ROLE_INFO[d.role].label, inviter: me.name || me.email, token }); emailed = true; }
      catch (e) { console.error(e); error = "Invite saved, but the email could not be sent."; }
    }
    results.push({ email, status: "invited", emailed, link: inviteDTO(inv).link, error });
    await audit(me.id, "invite.created", "invite", inv.id, { email, role: d.role, teams: teamIds.length });
  }
  return ok({ results });
});
