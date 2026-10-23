import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";

/** Events from your outside calendars between ?from and ?to (dates); a calendar that can't be read is skipped and its error shown. */
export const GET = route(async (req: Request) => {
  const me = await requireUser("viewer"); const u = new URL(req.url);
  const from = Date.parse(u.searchParams.get("from") || "") || Date.now() - 60 * 86400000, to = Date.parse(u.searchParams.get("to") || "") || Date.now() + 180 * 86400000;
  const cals = await db.select().from(schema.userCalendars).where(eq(schema.userCalendars.userId, me.id));
  const { calendarEvents } = await import("@/lib/icsCal");
  const out = await Promise.all(cals.map(async (c) => { try { const ev = await calendarEvents(c.url, from, to);
      if (c.lastError) await db.update(schema.userCalendars).set({ lastError: null, lastFetchAt: new Date() }).where(eq(schema.userCalendars.id, c.id));
      return ev.map((e) => ({ ...e, calId: c.id, calName: c.name, color: c.color })); }
    catch (e) { await db.update(schema.userCalendars).set({ lastError: e instanceof Error ? e.message : "Couldn't read it." }).where(eq(schema.userCalendars.id, c.id)); return []; } }));
  return ok({ events: out.flat() });
});
