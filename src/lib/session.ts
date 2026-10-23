import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import type { Role } from "@/db/schema";
import { HttpError } from "./http";
import { atLeast } from "./rbac";

export type CurrentUser = typeof schema.users.$inferSelect & { scopedMine?: boolean };

/** The signed-in, active user, read fresh from the database on every request. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return null;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!u || u.status !== "active") return null;
  // An admin who chose "Only mine" on Home sees the app as it is for their own work (like a sales rep);
  // "Everything" (the default) is the full view. Only admins can switch.
  if (u.role === "admin") { try { const { cookies } = await import("next/headers"); if ((await cookies()).get("lt-scope")?.value === "mine") return { ...u, role: "rep" as Role, scopedMine: true }; } catch { /* not in a request */ } }
  return u;
}

export async function requireUser(min: Role = "viewer"): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new HttpError(401, "Sign in to continue.");
  if (!atLeast(u.role, min)) throw new HttpError(403, "Your role does not allow this.");
  return u;
}
