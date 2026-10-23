import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError, route } from "@/lib/http";
import { quotePdf } from "@/lib/quotes";

export const GET = route(async (_req: Request, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params; const [q] = await db.select().from(schema.quotes).where(eq(schema.quotes.token, token)).limit(1); if (!q) throw new HttpError(404, "This quote link isn't valid.");
  return new Response(new Uint8Array(await quotePdf(q)), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="Quote-${q.number}.pdf"`, "cache-control": "private, no-store" } });
});
