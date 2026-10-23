import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { mailConfigured } from "@/lib/config";
import { sendInvite } from "@/lib/mail";
import { ROLE_INFO } from "@/lib/rbac";
import { inviteDTO } from "@/lib/leads";

export const POST = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("admin");
  const { id } = await params;
  const [inv] = await db.select().from(schema.invites).where(eq(schema.invites.id, id)).limit(1);
  if (!inv || inv.status !== "pending") throw new HttpError(404, "Invite not found.");
  if (!mailConfigured()) return ok({ emailed: false, link: inviteDTO(inv).link });
  await sendInvite({ to: inv.email, roleLabel: ROLE_INFO[inv.role].label, inviter: me.name || me.email, token: inv.token });
  await db.update(schema.invites).set({ lastSentAt: new Date() }).where(eq(schema.invites.id, id));
  return ok({ emailed: true, link: inviteDTO(inv).link });
});
