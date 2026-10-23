import { z } from "zod";
import { db, schema } from "@/db";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { paymentDTO, requireDealMoney } from "@/lib/payments";
import { audit } from "@/lib/audit";
import { requireCap } from "@/lib/permissions";

const paymentInput = z.object({
  amount: z.number().positive().max(1e12),
  status: z.enum(["received", "expected"]).default("received"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  note: z.string().trim().max(500).default(""),
});

/** Record money on a deal: received (with the date it came in) or expected (with the date it should come in). */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("rep"); await requireCap(me, "billing");
  const { id } = await params;
  await requireDealMoney(me, id);
  const d = await body(req, paymentInput);
  const [p] = await db.insert(schema.dealPayments).values({ dealId: id, ...d, createdById: me.id }).returning();
  await audit(me.id, "payment.added", "deal", id, { amount: d.amount, status: d.status, date: d.date });
  return ok(paymentDTO(p), 201);
});
