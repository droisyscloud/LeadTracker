import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { getConnection } from "@/lib/oauth";
import { db, schema } from "@/db";
import { inArray } from "drizzle-orm";
import { busyTimes, colleaguesBusy } from "@/lib/calendar";

export const GET = route(async (req: Request) => {
  const me = await requireUser("rep");
  const c = await getConnection(me.id);
  if (!c) throw new HttpError(409, "Connect your calendar on the Account page first.");
  // either an explicit window (one day, chosen in the browser's time zone) or the next N days
  const q = new URL(req.url).searchParams;
  let from: Date, to: Date;
  if (q.get("from") && q.get("to")) {
    from = new Date(q.get("from")!); to = new Date(q.get("to")!);
    if (isNaN(+from) || isNaN(+to) || to <= from || +to - +from > 3 * 86400_000 || +from > Date.now() + 120 * 86400_000) throw new HttpError(400, "Pick a date within the next four months.");
  } else {
    const days = Math.min(21, Math.max(1, Number(q.get("days") || 10)));
    from = new Date(); to = new Date(Date.now() + days * 86400_000);
  }
  let busy: Awaited<ReturnType<typeof busyTimes>>;
  try { busy = await busyTimes(c, from, to); }
  catch (e) { console.error("free/busy failed", e); throw new HttpError(502, `Couldn't read your calendar from ${c.provider === "google" ? "Google" : "Microsoft"}. Reconnect on the Account page, then try again.`); }
  // colleagues' busy times (only people who use the app, at most 10)
  const asked = (q.get("emails") || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).slice(0, 10);
  let others: Record<string, { start: string; end: string }[] | null> = {};
  if (asked.length) {
    const known = new Set((await db.select({ email: schema.users.email }).from(schema.users).where(inArray(schema.users.email, asked))).map((u) => u.email.toLowerCase()));
    others = await colleaguesBusy(c, from, to, asked.filter((e) => known.has(e) && e !== me.email.toLowerCase())).catch(() => ({}));
  }
  return ok({ busy, others, from: from.toISOString(), to: to.toISOString(), timezone: me.timezone });
});
