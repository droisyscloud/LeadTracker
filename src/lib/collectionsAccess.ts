import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError } from "./http";
import { requireDealMoney } from "./payments";
import { requireCap } from "./permissions";
import { requireUser } from "./session";

/** Billing work: a sales rep or above, with the billing permission. */
export async function requireBillingUser() { const me = await requireUser("rep"); await requireCap(me, "billing"); return me; }
export async function sowFor(me: Awaited<ReturnType<typeof requireBillingUser>>, sowId: string) {
  const [s] = await db.select().from(schema.sows).where(eq(schema.sows.id, sowId)).limit(1); if (!s) throw new HttpError(404, "SOW not found.");
  await requireDealMoney(me, s.dealId); return s;
}
export async function itemFor(me: Awaited<ReturnType<typeof requireBillingUser>>, itemId: string) {
  const [i] = await db.select().from(schema.billingItems).where(eq(schema.billingItems.id, itemId)).limit(1); if (!i) throw new HttpError(404, "Invoice not found.");
  await requireDealMoney(me, i.dealId); return i;
}

/** Accounting (QuickBooks, imports): anyone who can do billing work. */
export async function requireAccountingUser() { return requireBillingUser(); }
