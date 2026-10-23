import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { requireDealMoney } from "@/lib/payments";
import { quotePdf } from "@/lib/quotes";

export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("viewer"); const { id } = await params;
  const [q] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, id)).limit(1); if (!q) throw new HttpError(404, "Quote not found."); await requireDealMoney(me, q.dealId);
  return new Response(new Uint8Array(await quotePdf(q)), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="Quote-${q.number}.pdf"`, "cache-control": "private, no-store" } });
});
