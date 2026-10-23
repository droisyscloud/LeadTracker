import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { requireDealMoney } from "@/lib/payments";
import { billingDTO } from "@/lib/billing";
import { createBillingItem } from "@/lib/billingCreate";
import { itemFields } from "@/lib/billingInput";
import { requireCap } from "@/lib/permissions";

/** Add one billing item by hand (no SOW, or something the SOW didn't cover). */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("rep"); await requireCap(me, "billing"); const { id } = await params;
  await requireDealMoney(me, id);
  const d = await body(req, itemFields);
  const row = await createBillingItem({ ...d, dealId: id, createdById: me.id }, me.id);
  return ok(billingDTO(row), 201);
});
