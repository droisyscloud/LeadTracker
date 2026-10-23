import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, ok, route } from "@/lib/http";
import { requireAccountingUser } from "@/lib/collectionsAccess";
import { linkByHand } from "@/lib/accounting";
import { audit } from "@/lib/audit";

/** Link an unmatched accounting invoice to a the app invoice, or ignore it. */
export const POST = route(async (req: Request) => {
  const me = await requireAccountingUser();
  const d = await body(req, z.object({ id: z.string().uuid(), localType: z.enum(["billing"]).optional(), localId: z.string().uuid().optional(), ignore: z.boolean().optional() }));
  if (d.ignore) { await db.update(schema.accountingInvoices).set({ ignored: true }).where(eq(schema.accountingInvoices.id, d.id)); return ok({ ignored: true }); }
  const m = await linkByHand(d.id, d.localType!, d.localId!); await audit(me.id, "accounting.linked", "settings", null, { docNumber: m?.docNumber, localType: d.localType });
  return ok({ linked: true });
});
