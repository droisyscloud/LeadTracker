import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { createPasswordLink, passwordEnabled } from "@/lib/password";

type Ctx = { params: Promise<{ id: string }> };

/** Admins: a one-time link (valid 24 hours) for a teammate to set a new password. The admin sends it to them. */
export const POST = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser("admin");
  if (!passwordEnabled()) throw new HttpError(400, "Email and password sign-in is not turned on for this app.");
  const { id } = await params;
  const [u] = await db.select({ id: schema.users.id, email: schema.users.email, status: schema.users.status }).from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!u) throw new HttpError(404, "Not found.");
  if (u.status !== "active") throw new HttpError(400, "Restore this person's access first.");
  const link = await createPasswordLink(u.id, me.id, 24);
  await audit(me.id, "user.password_link", "user", u.id, { email: u.email });
  return ok({ link, expiresInHours: 24 });
});
