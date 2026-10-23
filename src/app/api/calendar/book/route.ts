import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor } from "@/lib/access";
import { getConnection } from "@/lib/oauth";
import { createMeeting } from "@/lib/calendar";
import { recordTouch } from "@/lib/touch";

const input = z.object({
  contactId: z.string().uuid().optional(),                    // the lead the meeting was booked from (older screens)
  contactIds: z.array(z.string().uuid()).max(20).default([]), // leads to invite
  userIds: z.array(z.string().uuid()).max(20).default([]),    // colleagues to invite
  emails: z.array(z.string().trim().toLowerCase().email()).max(20).default([]), // anyone else
  start: z.string().datetime(), minutes: z.number().int().min(15).max(240).default(30),
  subject: z.string().trim().min(1).max(300), body: z.string().max(5000).default(""), online: z.boolean().default(true),
});

/** Book one meeting with any mix of leads, colleagues and other people. It's logged on every invited lead's timeline. */
export const POST = route(async (req: Request) => {
  const me = await requireUser("rep");
  const d = await body(req, input);
  const c = await getConnection(me.id);
  if (!c) throw new HttpError(409, "Connect your calendar on the Account page first.");
  const acc = await accessFor(me);
  const leadIds = [...new Set([...(d.contactId ? [d.contactId] : []), ...d.contactIds])];
  for (const id of leadIds) if (!acc.canSeeContact(id)) throw new HttpError(404, "Lead not found.");
  const leads = leadIds.length ? await db.select().from(schema.contacts).where(inArray(schema.contacts.id, leadIds)) : [];
  const noEmail = leads.filter((l) => !l.email);
  if (noEmail.length) throw new HttpError(400, `${noEmail.map((l) => l.name).join(", ")} ${noEmail.length > 1 ? "have" : "has"} no email address to invite.`);
  const colleagues = d.userIds.length ? (await db.select().from(schema.users).where(inArray(schema.users.id, d.userIds))).filter((u) => u.status === "active" && u.id !== me.id) : [];
  const people = new Map<string, { email: string; name: string }>();
  for (const l of leads) people.set(l.email.toLowerCase(), { email: l.email, name: l.name });
  for (const u of colleagues) people.set(u.email.toLowerCase(), { email: u.email, name: u.name || u.email });
  for (const e of d.emails) if (!people.has(e) && e !== me.email.toLowerCase()) people.set(e, { email: e, name: "" });
  if (!people.size) throw new HttpError(400, "Add at least one person to invite.");
  // typed-in addresses that belong to leads you can see are logged on their timelines too
  const typed = d.emails.length ? (await db.select().from(schema.contacts).where(inArray(schema.contacts.email, d.emails))).filter((x) => acc.canEditContact(x.id) && !leadIds.includes(x.id)) : [];
  const start = new Date(d.start);
  const ev = await createMeeting(c, { subject: d.subject, body: d.body, start, minutes: d.minutes, attendees: [...people.values()], online: d.online, timeZone: me.timezone });
  const who = [...people.values()].map((p) => p.name || p.email).join(", ");
  const text = [d.body, `With: ${who}`, ev.link ? `Join: ${ev.link}` : ""].filter(Boolean).join("\n\n");
  const ids: string[] = [];
  for (const l of [...leads, ...typed]) {
    const [a] = await db.insert(schema.activities).values({ contactId: l.id, type: "meeting", subject: d.subject, body: text, meetingAt: start, byId: me.id, origin: "calendar", externalId: `cal:${ev.id}#${l.id}` }).onConflictDoNothing().returning();
    if (a) ids.push(a.id);
    await recordTouch(l.id, "meeting", { byId: me.id });
  }
  return ok({ activityId: ids[0] ?? null, activityIds: ids, invited: people.size, link: ev.link }, 201);
});

