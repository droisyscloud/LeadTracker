import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { HttpError, ok, route } from "@/lib/http";
import { availability, clearAvailability, loadPage } from "@/lib/booking";
import { createMeeting } from "@/lib/calendar";
import { getConnection } from "@/lib/oauth";
import { cleanEmail, websiteFromEmail } from "@/lib/normalize";
import { ensureCompany } from "@/lib/leads";
import { recordTouch } from "@/lib/touch";
import { defaultTeam } from "@/lib/teams";
import { appUrl, mailConfigured } from "@/lib/config";
import { sendSystemEmail } from "@/lib/mail";
import { fireWebhook } from "@/lib/webhooks";
import { addNotifications } from "@/lib/notify";
import { announce } from "@/lib/chat";
import { company } from "@/lib/brand";

/** Public: no sign-in. Anyone with the link can see free times and book one. */
type Ctx = { params: Promise<{ slug: string }> };
const hits = new Map<string, number[]>();
function limit(req: Request, max: number) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  const now = Date.now(); const recent = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  if (recent.length >= max) throw new HttpError(429, "Too many requests. Please try again later.");
  hits.set(ip, [...recent, now]);
}

export const GET = route(async (req: Request, { params }: Ctx) => {
  limit(req, 300);
  const { slug } = await params;
  const found = await loadPage(slug);
  if (!found) throw new HttpError(404, "This booking page isn't available.");
  const { page, user } = found;
  const minutes = Number(new URL(req.url).searchParams.get("minutes")) || page.durations[0] || 30;
  if (!page.durations.includes(minutes)) throw new HttpError(400, "That meeting length isn't offered.");
  try {
    const a = await availability(page, user, minutes);
    return ok({ name: user.name || user.email.split("@")[0], image: user.image, title: page.title, intro: page.intro, durations: page.durations, online: page.online, ...a });
  } catch (e) {
    console.error("booking availability failed", e);
    throw new HttpError(503, "Free times can't be loaded right now. Please try again shortly, or reply to the email you received.");
  }
});

const input = z.object({
  start: z.string().datetime(), minutes: z.number().int().min(15).max(120),
  name: z.string().trim().min(2).max(200), email: z.string().trim().email().max(320),
  company: z.string().trim().max(200).default(""), phone: z.string().trim().max(60).default(""), notes: z.string().max(2000).default(""),
  website_url: z.string().max(0).optional(), // honeypot: people never fill this in
});

export const POST = route(async (req: Request, { params }: Ctx) => {
  limit(req, 12);
  const { slug } = await params;
  const found = await loadPage(slug);
  if (!found) throw new HttpError(404, "This booking page isn't available.");
  const { page, user } = found;
  const parsed = input.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.some((i) => i.path[0] === "email") ? "Please enter a valid email address." : "Please fill in your name and email.");
  const d = parsed.data;
  if (!page.durations.includes(d.minutes)) throw new HttpError(400, "That meeting length isn't offered.");
  // make sure the time is still free right now
  const a = await availability(page, user, d.minutes, true).catch(() => null);
  const startIso = new Date(d.start).toISOString();
  if (!a || !Object.values(a.days).some((list) => list.includes(startIso))) throw new HttpError(409, "Sorry, that time was just taken. Please pick another.");
  const conn = await getConnection(user.id);
  if (!conn) throw new HttpError(503, "Booking is temporarily unavailable.");

  const email = cleanEmail(d.email);
  let [c] = await db.select().from(schema.contacts).where(and(eq(schema.contacts.email, email), eq(schema.contacts.personal, false))).limit(1);
  if (!c) {
    const companyId = await ensureCompany(d.company, websiteFromEmail(email), user.id);
    [c] = await db.insert(schema.contacts).values({ name: d.name, email, phone: d.phone, companyId, ownerId: user.id, createdById: user.id, source: "Booking page",
      status: "meeting", teamId: await defaultTeam(user.id), tags: ["Schedule meeting"] }).returning();
    await fireWebhook("lead.created", { contactId: c.id, name: c.name, email: c.email, source: "Booking page" });
  }
  const start = new Date(startIso);
  const subject = `${d.name.split(" ")[0]} and ${user.name || (await company()).name}${d.company ? ` (${d.company})` : ""}`;
  const desc = [d.notes ? `Notes from ${d.name}:\n${d.notes}` : "", d.phone ? `Phone: ${d.phone}` : "", `Booked through the ${(await company()).name} booking page.`].filter(Boolean).join("\n\n");
  let ev: { id: string; link: string | null };
  try { ev = await createMeeting(conn, { subject, body: desc, start, minutes: d.minutes, attendee: { email, name: d.name }, online: page.online, timeZone: user.timezone }); }
  catch (e) { console.error("booking create failed", e); throw new HttpError(502, "The meeting couldn't be created. Please try again in a minute."); }
  clearAvailability(user.id);
  await db.insert(schema.activities).values({ contactId: c.id, type: "meeting", subject, body: [desc, ev.link ? `Join: ${ev.link}` : ""].filter(Boolean).join("\n\n"), meetingAt: start, byId: user.id, origin: "calendar", kind: "Booking page", externalId: `cal:${ev.id}` }).onConflictDoNothing();
  await recordTouch(c.id, "meeting", { byId: user.id });
  const when = start.toLocaleString("en-US", { timeZone: user.timezone, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
  await announce("booking", `📅 ${d.name}${d.company ? ` (${d.company})` : ""} booked ${d.minutes} minutes with ${user.name || user.email} on ${when}. ${appUrl()}/contacts?id=${c.id}`);
  await addNotifications([{ userId: user.id, kind: "booking", text: `${d.name} booked a meeting for ${when}`, link: `/contacts?id=${c.id}` }]);
  if (mailConfigured()) sendSystemEmail({ to: user.email, subject: `New booking: ${d.name}, ${when}`, text: `${d.name}${d.company ? ` from ${d.company}` : ""} (${email}) booked ${d.minutes} minutes with you on ${when}.${d.notes ? `\n\nTheir notes: ${d.notes}` : ""}\n\nLead: ${appUrl()}/contacts?id=${c.id}` }).catch(() => undefined);
  return ok({ booked: true, start: startIso, minutes: d.minutes, link: ev.link, timezone: user.timezone }, 201);
});
