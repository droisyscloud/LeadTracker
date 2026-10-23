import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";
import { requireAccountingUser } from "@/lib/collectionsAccess";
import { qboConfigured, qboRedirect } from "@/lib/qbo";
import { unmatched } from "@/lib/accounting";

/** Connection status and accounting invoices that couldn't be matched yet. */
export const GET = route(async () => {
  await requireAccountingUser();
  const [c] = await db.select().from(schema.accountingConnections).where(eq(schema.accountingConnections.provider, "quickbooks")).limit(1);
  const all = await db.select().from(schema.accountingInvoices);
  return ok({ quickbooks: { configured: qboConfigured(), redirectUri: qboRedirect(), connected: !!c, companyName: c?.companyName || "", status: c?.status || null, lastError: c?.lastError || null, lastSyncAt: c?.lastSyncAt?.getTime() ?? null },
    counts: { total: all.length, linked: all.filter((x) => x.localId).length }, unmatched: (await unmatched()).map((x) => ({ ...x, updatedAt: x.updatedAt.getTime() })) });
});
