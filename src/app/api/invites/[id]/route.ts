import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";

export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("admin");
  const { id } = await params;
  await db.update(schema.invites).set({ status: "revoked" }).where(eq(schema.invites.id, id));
  await audit(me.id, "invite.revoked", "invite", id);
  return ok({ revoked: true });
});
