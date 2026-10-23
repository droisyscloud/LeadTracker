import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { busyTimes } from "./calendar";
import { getConnection } from "./oauth";

export type BookingPage = typeof schema.bookingPages.$inferSelect;

/** Minutes a time zone is ahead of UTC at a given moment. */
function offsetMin(tz: string, at: Date): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at).map((x) => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - at.getTime()) / 60000;
}
/** A wall-clock time in a time zone as a real instant (handles daylight saving changes). */
export function zoned(date: string, minutes: number, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  let t = guess - offsetMin(tz, new Date(guess)) * 60000;
  const o2 = offsetMin(tz, new Date(t)); t = guess - o2 * 60000;
  return new Date(t);
}
export function localDate(tz: string, at = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}
const addDays = (date: string, n: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export async function loadPage(slug: string) {
  const [p] = await db.select().from(schema.bookingPages).where(eq(schema.bookingPages.slug, slug.toLowerCase())).limit(1);
  if (!p || !p.enabled) return null;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, p.userId)).limit(1);
  if (!u || u.status !== "active") return null;
  return { page: p, user: u };
}

const cache = new Map<string, { at: number; busy: { start: string; end: string }[] }>();
/**
 * Free start times for each day in the booking window, in the owner's time zone.
 * One free/busy request covers the whole window; it's cached for a minute so a busy page doesn't hammer Google.
 */
export async function availability(p: BookingPage, u: typeof schema.users.$inferSelect, minutes: number, fresh = false) {
  const conn = await getConnection(u.id);
  if (!conn) throw new Error("not-connected");
  const tz = u.timezone || "America/Los_Angeles";
  const today = localDate(tz).date;
  const from = zoned(today, 0, tz), to = zoned(addDays(today, p.daysAhead + 1), 0, tz);
  const key = `${u.id}:${today}`;
  let busy = cache.get(key);
  if (!busy || fresh || Date.now() - busy.at > 60_000) { busy = { at: Date.now(), busy: await busyTimes(conn, from, to) }; cache.set(key, busy); }
  const blocks = busy.busy.map((b) => [Date.parse(b.start) - p.bufferMin * 60000, Date.parse(b.end) + p.bufferMin * 60000]);
  const earliest = Date.now() + p.minNoticeHours * 3600_000;
  const step = minutes <= 15 ? 15 : 30;
  const days: Record<string, string[]> = {};
  for (let i = 0; i <= p.daysAhead; i++) {
    const date = addDays(today, i);
    const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (!p.workdays.includes(wd)) continue;
    const out: string[] = [];
    for (let m = p.startHour * 60; m + minutes <= p.endHour * 60; m += step) {
      const s = zoned(date, m, tz).getTime(), e = s + minutes * 60000;
      if (s < earliest || blocks.some(([a, z]) => s < z && e > a)) continue;
      out.push(new Date(s).toISOString());
    }
    if (out.length) days[date] = out;
  }
  return { timezone: tz, days };
}
export function clearAvailability(userId: string) { for (const k of [...cache.keys()]) if (k.startsWith(`${userId}:`)) cache.delete(k); }

export function slugify(s: string) { return s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 40) || "me"; }
