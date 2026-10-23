import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { requireDealMoney } from "@/lib/payments";
import { nextNumber, newToken, quoteDTO, totals } from "@/lib/quotes";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };
export const quoteInput = z.object({ title: z.string().max(200).default(""), intro: z.string().max(6000).default(""), terms: z.string().max(4000).default(""),
  lines: z.array(z.object({ description: z.string().max(500), qty: z.number().min(0).max(1e6), unitPrice: z.number().min(0).max(1e9) })).max(50).default([]),
  currency: z.string().trim().length(3).toUpperCase().default("USD"), discountPct: z.number().min(0).max(100).default(0), taxRate: z.number().min(0).max(50).default(0), validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null) });
export const GET = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser("viewer"); const { id } = await params; await requireDealMoney(me, id);
  return ok({ quotes: (await db.select().from(schema.quotes).where(eq(schema.quotes.dealId, id)).orderBy(desc(schema.quotes.createdAt))).map(quoteDTO) });
});
export const POST = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser("rep"); const { id } = await params; await requireDealMoney(me, id);
  const d = await body(req, quoteInput); const t = totals(d.lines, d.discountPct, d.taxRate);
  const [q] = await db.insert(schema.quotes).values({ ...d, dealId: id, number: await nextNumber(), token: newToken(), subtotal: t.subtotal, total: t.total, createdById: me.id }).returning();
  await audit(me.id, "quote.created", "deal", id, { number: q.number, total: q.total });
  return ok(quoteDTO(q), 201);
});
