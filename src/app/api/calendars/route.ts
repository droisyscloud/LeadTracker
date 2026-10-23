import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";

/** Your outside calendars (only yours: nobody else sees them). */
export const GET = route(async () => {
  const me = await requireUser("viewer");
  const rows = await db.select().from(schema.userCalendars).where(eq(schema.userCalendars.userId, me.id));
  return ok({ calendars: rows.map((r) => ({ id: r.id, name: r.name, color: r.color, host: (() => { try { return new URL(r.url.replace(/^webcals?:/i, "https:")).hostname; } catch { return ""; } })(), lastFetchAt: r.lastFetchAt?.getTime() ?? null, lastError: r.lastError })) });
});
/** Link a calendar by its private calendar (iCal) link; it's read once straight away to check it works. */
export const POST = route(async (req: Request) => {
  const me = await requireUser("viewer");
  const d = await body(req, z.object({ name: z.string().trim().min(1).max(80), url: z.string().trim().min(8).max(2000), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#7c5cff") }));
  const { calendarEvents } = await import("@/lib/icsCal");
  let n = 0; try { n = (await calendarEvents(d.url, Date.now() - 30 * 86400000, Date.now() + 180 * 86400000, true)).length; } catch (e) { throw new HttpError(400, e instanceof Error ? e.message : "Couldn't read that calendar."); }
  const [r] = await db.insert(schema.userCalendars).values({ userId: me.id, name: d.name, url: d.url, color: d.color, lastFetchAt: new Date() }).returning();
  return ok({ id: r.id, events: n });
});
export const DELETE = route(async (req: Request) => {
  const me = await requireUser("viewer"); const id = new URL(req.url).searchParams.get("id") || "";
  await db.delete(schema.userCalendars).where(and(eq(schema.userCalendars.id, id), eq(schema.userCalendars.userId, me.id)));
  return ok({ deleted: true });
});
void HttpError;
