import { lookup } from "dns/promises";
import { isIP } from "net";

/** Reading outside calendars from their private calendar link (iCal / .ics): one-off and repeating events, time zones, all-day events, cancellations. */
export type CalEvent = { id: string; title: string; start: string; end: string | null; allDay: boolean; location: string };

/** Only ordinary internet addresses (never this server or the private network). webcal:// is read as https://. */
export async function safeUrl(raw: string) {
  let u: URL; try { u = new URL(raw.trim().replace(/^webcals?:\/\//i, "https://")); } catch { throw new Error("That isn't a link. Paste the calendar's full address (it starts with https:// or webcal://)."); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Use the calendar's https:// or webcal:// link.");
  const host = u.hostname.toLowerCase(); if ((host === "localhost" && process.env["TEST_ALLOW_LOCAL_CAL"] !== "1") || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("That address isn't on the internet.");
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => { throw new Error("Couldn't find that address."); })).map((x) => x.address);
  if (ips.some(isPrivate) && process.env["TEST_ALLOW_LOCAL_CAL"] !== "1") throw new Error("That address isn't on the internet.");   // (tests only: local test calendars)
  return u.toString();
}
function isPrivate(ip: string): boolean {
  if (ip.includes(":")) return ip === "::1" || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || ip.startsWith("::ffff:") && isPrivate(ip.slice(7));
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
export async function fetchIcs(url: string) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
  try { const r = await fetch(await safeUrl(url), { signal: ctl.signal, redirect: "follow", headers: { "user-agent": "LeadTracker calendar reader" } });
    if (!r.ok) throw new Error(r.status === 404 ? "The calendar link wasn't found (404). Check it's the private/secret address." : `The calendar answered ${r.status}.`);
    const text = await r.text(); if (text.length > 8_000_000) throw new Error("That calendar is too large."); if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("That link isn't a calendar (no iCal data). Use the calendar's iCal / .ics address.");
    return text; } catch (e) { if ((e as Error).name === "AbortError") throw new Error("The calendar took too long to answer."); throw e; } finally { clearTimeout(t); }
}
type Prop = { name: string; params: Record<string, string>; value: string };
function props(block: string[]): Prop[] {
  return block.map((l) => { const i = l.indexOf(":"); if (i < 0) return null; const head = l.slice(0, i), value = l.slice(i + 1); const [name, ...ps] = head.split(";");
    const params: Record<string, string> = {}; for (const p of ps) { const [k, v] = p.split("="); if (k) params[k.toUpperCase()] = (v || "").replace(/^"|"$/g, ""); } return { name: name.toUpperCase(), params, value }; }).filter(Boolean) as Prop[];
}
const unesc = (s: string) => s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
/** a local wall-clock time in a time zone → the real moment (UTC) */
function zoned(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const off = (t: number) => { try { const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t; } catch { return 0; } };
  let t = guess - off(guess); t = guess - off(t); return t;
}
function when(p: Prop | undefined): { t: number; allDay: boolean } | null {
  if (!p) return null; const v = p.value.trim(); const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/); if (!m) return null;
  if (!m[4] || p.params.VALUE === "DATE") return { t: Date.UTC(+m[1], +m[2] - 1, +m[3]), allDay: true };
  const [y, mo, d, h, mi, s] = [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0)];
  if (m[7]) return { t: Date.UTC(y, mo - 1, d, h, mi, s), allDay: false };
  return { t: p.params.TZID ? zoned(y, mo, d, h, mi, s, p.params.TZID.replace(/^.*\/(?=[A-Z][a-z]+\/)/, "")) : Date.UTC(y, mo - 1, d, h, mi, s), allDay: false };
}
const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
/** Every event (and repeat) that falls between from and to. */
export function parseIcs(text: string, from: number, to: number): CalEvent[] {
  const lines = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const evs: Prop[][] = []; let cur: string[] | null = null;
  for (const l of lines) { if (l === "BEGIN:VEVENT") cur = []; else if (l === "END:VEVENT") { if (cur) evs.push(props(cur)); cur = null; } else if (cur) cur.push(l); }
  const get = (ps: Prop[], n: string) => ps.find((p) => p.name === n);
  const moved = new Set<string>(); for (const ps of evs) { const rid = get(ps, "RECURRENCE-ID"); const uid = get(ps, "UID")?.value; const w = when(rid); if (rid && uid && w) moved.add(`${uid}|${w.t}`); }
  const out: CalEvent[] = [];
  for (const ps of evs) {
    if ((get(ps, "STATUS")?.value || "").toUpperCase() === "CANCELLED") continue;
    const s = when(get(ps, "DTSTART")); if (!s) continue; const e = when(get(ps, "DTEND"));
    let dur = e ? e.t - s.t : s.allDay ? 86400000 : 0;
    const du = get(ps, "DURATION")?.value.match(/P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/); if (!e && du) dur = ((+(du[1] || 0) * 7 + +(du[2] || 0)) * 86400 + +(du[3] || 0) * 3600 + +(du[4] || 0) * 60 + +(du[5] || 0)) * 1000;
    const uid = get(ps, "UID")?.value || `${s.t}`; const title = unesc(get(ps, "SUMMARY")?.value || "(busy)"), location = unesc(get(ps, "LOCATION")?.value || "");
    const ex = new Set(ps.filter((p) => p.name === "EXDATE").flatMap((p) => p.value.split(",").map((v) => when({ ...p, value: v })?.t).filter((x): x is number => x != null)));
    const push = (t: number) => { if (t + Math.max(dur, 1) < from || t > to || ex.has(t) || (!get(ps, "RECURRENCE-ID") && moved.has(`${uid}|${t}`))) return;
      out.push({ id: `${uid}|${t}`, title, location, allDay: s.allDay, start: s.allDay ? new Date(t).toISOString().slice(0, 10) : new Date(t).toISOString(), end: dur ? (s.allDay ? new Date(t + dur - 86400000).toISOString().slice(0, 10) : new Date(t + dur).toISOString()) : null }); };
    const rr = get(ps, "RRULE")?.value; if (!rr) { push(s.t); continue; }
    const R = Object.fromEntries(rr.split(";").map((x) => x.split("=")).map(([k, v]) => [k.toUpperCase(), v]));
    const freq = R.FREQ, n = Math.max(1, +(R.INTERVAL || 1)), count = R.COUNT ? +R.COUNT : Infinity, until = R.UNTIL ? when({ name: "UNTIL", params: {}, value: R.UNTIL })?.t ?? Infinity : Infinity;
    const byday = (R.BYDAY || "").split(",").filter(Boolean).map((x: string) => DAYS.indexOf(x.slice(-2))).filter((x: number) => x >= 0);
    const base = new Date(s.t); let k = 0, made = 0;
    while (made < count && k < 3000) {
      let cands: number[] = [];
      if (freq === "DAILY") cands = [s.t + k * n * 86400000];
      else if (freq === "WEEKLY") { const wk = s.t + k * n * 7 * 86400000; const dow = new Date(s.t).getUTCDay(); cands = (byday.length ? byday : [dow]).map((d: number) => wk + ((d - dow + 7) % 7) * 86400000).sort((a: number, b: number) => a - b); }
      else if (freq === "MONTHLY") { const d = new Date(base); d.setUTCMonth(base.getUTCMonth() + k * n); if (d.getUTCDate() === base.getUTCDate()) cands = [d.getTime()]; }
      else if (freq === "YEARLY") { const d = new Date(base); d.setUTCFullYear(base.getUTCFullYear() + k * n); cands = [d.getTime()]; }
      else break;
      for (const t of cands) { if (t < s.t) continue; if (t > until || made >= count) { made = count; break; } made++; push(t); }
      if ((cands[0] ?? Infinity) > to) break; k++;
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}
const cache = new Map<string, { at: number; text: string }>();
/** A calendar's events in a window (re-read at most every 10 minutes). */
export async function calendarEvents(url: string, from: number, to: number, fresh = false) {
  const c = cache.get(url); let text = c && !fresh && Date.now() - c.at < 600_000 ? c.text : "";
  if (!text) { text = await fetchIcs(url); cache.set(url, { at: Date.now(), text }); }
  return parseIcs(text, from, to);
}
