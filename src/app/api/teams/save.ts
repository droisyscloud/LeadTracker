import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
export async function setTeamLinks(teamId: string, memberIds?: string[], productIds?: string[]) {
  if (memberIds) {
    await db.delete(schema.teamMembers).where(eq(schema.teamMembers.teamId, teamId));
    const ids = [...new Set(memberIds)]; if (ids.length) await db.insert(schema.teamMembers).values(ids.map((userId) => ({ teamId, userId }))).onConflictDoNothing();
  }
  if (productIds) {
    await db.delete(schema.teamProducts).where(eq(schema.teamProducts.teamId, teamId));
    const ids = [...new Set(productIds)]; if (ids.length) await db.insert(schema.teamProducts).values(ids.map((productId) => ({ teamId, productId }))).onConflictDoNothing();
  }
}
