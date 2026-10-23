import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
export async function getState(key: string) {
  const [r] = await db.select().from(schema.jobState).where(eq(schema.jobState.key, key)).limit(1);
  return r?.value ?? null;
}
export async function setState(key: string, value: Record<string, unknown>) {
  await db.insert(schema.jobState).values({ key, value, updatedAt: new Date() }).onConflictDoUpdate({ target: schema.jobState.key, set: { value, updatedAt: new Date() } });
}
