import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
/** The team a person belongs to, if exactly one. Used to file new leads and deals automatically. */
export async function defaultTeam(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const rows = await db.select().from(schema.teamMembers).where(eq(schema.teamMembers.userId, userId));
  return rows.length === 1 ? rows[0].teamId : null;
}
