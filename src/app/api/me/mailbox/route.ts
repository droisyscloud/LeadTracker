import { syncCalendarMeetings } from "@/lib/calendar";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { getConnection } from "@/lib/oauth";
import { syncMailbox, upgradePreviews } from "@/lib/mailsync";

export const DELETE = route(async () => {
  const me = await requireUser("viewer");
  await db.delete(schema.connections).where(eq(schema.connections.userId, me.id));
  return ok({ disconnected: true });
});
/** Sync my mailbox right now. { refresh: true, days: 30 } re-reads that period in full, including emails saved earlier as previews. */
export const POST = route(async (req: Request) => {
  const me = await requireUser("rep");
  const c = await getConnection(me.id);
  if (!c) return ok({ logged: 0, connected: false });
  const opts = await req.json().catch(() => ({})) as { refresh?: boolean; days?: number };
  const days = Math.max(1, Math.min(90, Number(opts.days) || 30));
  try {
    const r = await syncMailbox(c, opts.refresh ? { refresh: true, since: new Date(Date.now() - days * 86400_000) } : {});
    const cal = await syncCalendarMeetings(c).catch((e) => { console.error("calendar sync failed", e); return { meetings: 0, updated: 0 }; });
    const upgraded = await upgradePreviews(c, opts.refresh ? 300 : 40).catch(() => 0);
    return ok({ ...r, updated: r.updated + upgraded, upgraded, meetings: cal.meetings, connected: true });
  }
  catch (e) { console.error("sync now failed", e); throw new HttpError(502, `Couldn't reach ${c.provider === "google" ? "Google" : "Microsoft"} to sync. Check the status on this page; Reconnect if it keeps happening.`); }
});
