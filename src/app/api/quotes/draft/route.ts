import { z } from "zod";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { requireDealMoney } from "@/lib/payments";
import { draftQuote } from "@/lib/quotes";

/** AI drafts a quote's title, introduction, lines and terms from the deal. */
export const POST = route(async (req: Request) => {
  const me = await requireUser("rep"); const d = await body(req, z.object({ dealId: z.string().uuid() })); await requireDealMoney(me, d.dealId);
  return ok(await draftQuote(d.dealId));
});
