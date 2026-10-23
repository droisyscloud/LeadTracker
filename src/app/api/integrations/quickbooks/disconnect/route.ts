import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";

export const POST = route(async () => {
  const me = await requireUser("admin");
  await db.delete(schema.accountingConnections).where(eq(schema.accountingConnections.provider, "quickbooks"));
  await audit(me.id, "accounting.disconnected", "settings", null, { provider: "quickbooks" });
  return ok({ disconnected: true });
});
