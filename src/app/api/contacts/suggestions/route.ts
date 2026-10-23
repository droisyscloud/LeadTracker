import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";

/** People found in synced email at this company who aren't contacts yet. */
export const GET = route(async (req: Request) => {
  await requireUser("viewer"); const companyId = new URL(req.url).searchParams.get("companyId") || "";
  if (!/^[0-9a-f-]{36}$/.test(companyId)) throw new HttpError(400, "Which company?");
  const rows = await db.select().from(schema.contactSuggestions).where(and(eq(schema.contactSuggestions.companyId, companyId), eq(schema.contactSuggestions.status, "new"))).orderBy(desc(schema.contactSuggestions.lastAt));
  return ok({ people: rows.map((r) => ({ ...r, lastAt: r.lastAt.getTime(), createdAt: r.createdAt.getTime() })) });
});
