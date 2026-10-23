import { apiFetch, type Conn } from "./oauth";
import { practiceMode } from "./config";
const GCAL = () => process.env.GOOGLE_CALENDAR_API_BASE || "https://www.googleapis.com";
const GRAPH = () => process.env.GRAPH_API_BASE || "https://graph.microsoft.com";

export type Busy = { start: string; end: string };

export async function busyTimes(c: Conn, from: Date, to: Date): Promise<Busy[]> {
  if (practiceMode()) { console.log("[practice] not sent: busyTimes"); return []; }
  if (c.provider === "microsoft") {
    type R = { value: { start: { dateTime: string }; end: { dateTime: string }; showAs?: string; isCancelled?: boolean }[]; "@odata.nextLink"?: string };
    let url: string | null = `${GRAPH()}/v1.0/me/calendarView?startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}&$select=start,end,showAs,isCancelled&$top=200`;
    const out: Busy[] = [];
    while (url) {
      const r: R = await apiFetch<R>(c, url, { headers: { Prefer: 'outlook.timezone="UTC"' } });
      for (const e of r.value) if (!e.isCancelled && e.showAs !== "free") out.push({ start: e.start.dateTime.replace(/(\.\d+)?$/, "Z"), end: e.end.dateTime.replace(/(\.\d+)?$/, "Z") });
      url = r["@odata.nextLink"] || null;
    }
    return out;
  }
  const r = await apiFetch<{ calendars: Record<string, { busy: Busy[] }> }>(c, `${GCAL()}/calendar/v3/freeBusy`, {
    method: "POST", body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: "primary" }] }),
  });
  return r.calendars.primary?.busy || [];
}

export async function createMeeting(c: Conn, m: { subject: string; body: string; start: Date; minutes: number; attendee?: { email: string; name: string }; attendees?: { email: string; name: string }[]; online: boolean; timeZone: string }): Promise<{ id: string; link: string | null }> {
  if (practiceMode()) { console.log("[practice] not sent: createMeeting"); return { id: `practice-${Date.now()}`, link: "https://meet.google.com/practice-space" }; }
  const people = m.attendees?.length ? m.attendees : m.attendee ? [m.attendee] : [];
  const end = new Date(m.start.getTime() + m.minutes * 60_000);
  if (c.provider === "microsoft") {
    const r = await apiFetch<{ id: string; onlineMeeting?: { joinUrl?: string } }>(c, `${GRAPH()}/v1.0/me/events`, {
      method: "POST", body: JSON.stringify({
        subject: m.subject, body: { contentType: "text", content: m.body },
        start: { dateTime: m.start.toISOString().slice(0, 19), timeZone: "UTC" }, end: { dateTime: end.toISOString().slice(0, 19), timeZone: "UTC" },
        attendees: people.map((p) => ({ emailAddress: { address: p.email, name: p.name }, type: "required" })),
        ...(m.online ? { isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" } : {}),
      }),
    });
    return { id: r.id, link: r.onlineMeeting?.joinUrl || null };
  }
  const r = await apiFetch<{ id: string; hangoutLink?: string }>(c, `${GCAL()}/calendar/v3/calendars/primary/events?sendUpdates=all${m.online ? "&conferenceDataVersion=1" : ""}`, {
    method: "POST", body: JSON.stringify({
      summary: m.subject, description: m.body, start: { dateTime: m.start.toISOString() }, end: { dateTime: end.toISOString() },
      attendees: people.map((p) => ({ email: p.email, displayName: p.name })),
      ...(m.online ? { conferenceData: { createRequest: { requestId: `lt-${Date.now()}`, conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {}),
    }),
  });
  return { id: r.id, link: r.hangoutLink || null };
}

/**
 * Busy times for colleagues (by work email), so a meeting can be placed when everyone is free.
 * Google Workspace and Microsoft 365 share free/busy inside the organisation by default.
 */
export async function colleaguesBusy(c: Conn, from: Date, to: Date, emails: string[]): Promise<Record<string, Busy[] | null>> {
  if (practiceMode()) { console.log("[practice] not sent: colleaguesBusy"); return Object.fromEntries(emails.map((e) => [e, []])); }
  if (!emails.length) return {};
  if (c.provider === "microsoft") {
    type R = { value: { scheduleId: string; scheduleItems?: { status: string; start: { dateTime: string }; end: { dateTime: string } }[]; error?: unknown }[] };
    const r = await apiFetch<R>(c, `${GRAPH()}/v1.0/me/calendar/getSchedule`, { method: "POST", headers: { Prefer: 'outlook.timezone="UTC"' },
      body: JSON.stringify({ schedules: emails, startTime: { dateTime: from.toISOString().slice(0, 19), timeZone: "UTC" }, endTime: { dateTime: to.toISOString().slice(0, 19), timeZone: "UTC" }, availabilityViewInterval: 15 }) });
    return Object.fromEntries(r.value.map((v) => [v.scheduleId.toLowerCase(), v.error || !v.scheduleItems ? null
      : v.scheduleItems.filter((i) => i.status !== "free").map((i) => ({ start: i.start.dateTime.replace(/(\.\d+)?$/, "Z"), end: i.end.dateTime.replace(/(\.\d+)?$/, "Z") }))]));
  }
  const r = await apiFetch<{ calendars: Record<string, { busy: Busy[]; errors?: unknown[] }> }>(c, `${GCAL()}/calendar/v3/freeBusy`, {
    method: "POST", body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: emails.map((id) => ({ id })) }),
  });
  return Object.fromEntries(emails.map((e) => { const x = r.calendars[e] || r.calendars[e.toLowerCase()]; return [e.toLowerCase(), !x || x.errors?.length ? null : x.busy]; }));
}

/**
 * Meetings from Google Calendar: any event (30 days back to 90 ahead) with a contact as a guest is logged on that
 * contact's timeline as a meeting; changed times follow; cancelled events are marked cancelled. Meetings booked
 * from the app use the same id, so nothing is logged twice.
 */
export async function syncCalendarMeetings(c: Conn): Promise<{ meetings: number; updated: number }> {
  if (c.provider !== "google" || practiceMode()) return { meetings: 0, updated: 0 };
  const { db, schema } = await import("@/db"); const { eq, inArray } = await import("drizzle-orm"); const { recordTouch } = await import("./touch");
  const contacts = (await db.select({ id: schema.contacts.id, email: schema.contacts.email, otherEmails: schema.contacts.otherEmails, personal: schema.contacts.personal, createdById: schema.contacts.createdById }).from(schema.contacts)).filter((x) => !x.personal || x.createdById === c.userId);   // personal contacts: only in their owner's calendar
  const byEmail = new Map(contacts.flatMap((x) => [x.email, ...(x.otherEmails || [])].filter(Boolean).map((e) => [e.toLowerCase().trim(), x.id] as [string, string])));
  if (!byEmail.size) return { meetings: 0, updated: 0 };
  const min = new Date(Date.now() - 30 * 86400_000).toISOString(), max = new Date(Date.now() + 90 * 86400_000).toISOString();
  type Ev = { id: string; status?: string; summary?: string; description?: string; location?: string; hangoutLink?: string; start?: { dateTime?: string; date?: string }; attendees?: { email?: string; self?: boolean }[]; organizer?: { email?: string } };
  const events: Ev[] = []; let page = "";
  for (let i = 0; i < 5; i++) {
    const r = await apiFetch<{ items?: Ev[]; nextPageToken?: string }>(c, `${GCAL()}/calendar/v3/calendars/primary/events?singleEvents=true&showDeleted=true&maxResults=250&timeMin=${encodeURIComponent(min)}&timeMax=${encodeURIComponent(max)}${page ? `&pageToken=${page}` : ""}`);
    events.push(...(r.items || [])); if (!r.nextPageToken) break; page = r.nextPageToken; }
  let meetings = 0, updated = 0;
  for (const ev of events) {
    const startS = ev.start?.dateTime || (ev.start?.date ? `${ev.start.date}T09:00:00` : null); if (!startS) continue; const start = new Date(startS);
    const who = [...new Set([...(ev.attendees || []).filter((a) => !a.self).map((a) => a.email), ev.organizer?.email].filter(Boolean).map((e) => e!.toLowerCase()).map((e) => byEmail.get(e)).filter(Boolean) as string[])];
    if (!who.length) continue;
    const ids = who.map((id) => `cal:${ev.id}#${id}`); const existing = await db.select().from(schema.activities).where(inArray(schema.activities.externalId, ids));
    const cos = await db.select({ id: schema.contacts.id, companyId: schema.contacts.companyId }).from(schema.contacts).where(inArray(schema.contacts.id, who));
    const lead = new Map<string, string>(); for (const id of who) { const k = cos.find((x) => x.id === id)?.companyId || `c:${id}`; if (!lead.has(k)) lead.set(k, id); }
    const leadOf = (id: string) => { const k = cos.find((x) => x.id === id)?.companyId || `c:${id}`; return { isLead: lead.get(k) === id, key: `${ev.id}:${k}`, companyId: cos.find((x) => x.id === id)?.companyId || null }; };
    const cancelled = ev.status === "cancelled"; const body = [ev.description || "", ev.location ? `Where: ${ev.location}` : "", ev.hangoutLink ? `Join: ${ev.hangoutLink}` : ""].filter(Boolean).join("\n\n");
    for (const contactId of who) {
      const ext = `cal:${ev.id}#${contactId}`; const cur = existing.find((x) => x.externalId === ext);
      if (!cur) { if (cancelled) continue;
        const [ins] = await db.insert(schema.activities).values({ contactId, type: "meeting", subject: ev.summary || "Meeting", body, meetingAt: start, byId: c.userId, origin: "calendar", externalId: ext }).onConflictDoNothing().returning({ id: schema.activities.id });
        await recordTouch(contactId, "meeting", { byId: c.userId }); meetings++;
        const L1 = leadOf(contactId); if (ins && L1.isLead) await meetingTasks(L1.key, contactId, L1.companyId, start, ev.summary || "Meeting", c.userId, false).catch((e) => console.error("meeting tasks", e));
        continue; }
      const changed = cur.cancelled !== cancelled || (cur.meetingAt?.getTime() ?? 0) !== start.getTime() || (ev.summary && cur.subject !== ev.summary);
      if (changed) { await db.update(schema.activities).set({ cancelled, meetingAt: start, subject: ev.summary || cur.subject }).where(eq(schema.activities.id, cur.id)); updated++;
        const L2 = leadOf(contactId); if (L2.isLead) await meetingTasks(L2.key, contactId, L2.companyId, start, ev.summary || cur.subject, c.userId, cancelled).catch((e) => console.error("meeting tasks", e)); }
    }
  }
  return { meetings, updated };
}

/** "Meeting set" automation: a prep task the day before, a follow-up task the day after, and the next follow-up date. */
async function meetingTasks(activityId: string, contactId: string, companyId: string | null, start: Date, title: string, userId: string, cancelled: boolean) {
  const { db, schema } = await import("@/db"); const { and, eq, inArray } = await import("drizzle-orm"); const { getState } = await import("./jobstate");
  const st = ((await getState("meeting-automation")) || {}) as { enabled?: boolean }; if (st.enabled === false) return;
  const keys = [`prep:${activityId}`, `follow:${activityId}`];
  if (cancelled) { await db.delete(schema.tasks).where(and(inArray(schema.tasks.sourceKey, keys), eq(schema.tasks.done, false))); await db.delete(schema.taskSuggestions).where(and(inArray(schema.taskSuggestions.sourceKey, keys), eq(schema.taskSuggestions.status, "new"))); return; }
  // only for meetings still to come: a meeting that has already happened (the sync also reads the last 30 days) gets no tasks or follow-up date
  if (start.getTime() <= Date.now()) return;
  const [u] = await db.select({ tz: schema.users.timezone }).from(schema.users).where(eq(schema.users.id, userId)).limit(1); const tz = u?.tz || "America/Los_Angeles";
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: tz }); const today = day(new Date());
  const before = day(new Date(start.getTime() - 86400_000)); const prepDue = before < today ? today : before; const after = day(new Date(start.getTime() + 86400_000));
  const [ct] = await db.select({ name: schema.contacts.name, next: schema.contacts.nextFollowUp }).from(schema.contacts).where(eq(schema.contacts.id, contactId)).limit(1);
  const [co] = companyId ? await db.select({ name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1) : [];
  const withWho = co?.name || ct?.name || "contact";   // one set of tasks per company, not per person
  const when = start.toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  // suggestions only: nothing is added to anyone's tasks until they choose to
  const rows = [{ sourceKey: keys[0], kind: "prep" as const, title: `Prepare for ${title} with ${withWho}`, notes: `Meeting ${when}. Open the contact for Meeting prep (a briefing of the history and talking points).`, dueDate: prepDue },
    { sourceKey: keys[1], kind: "follow" as const, title: `Follow up after ${title} with ${withWho}`, notes: `Send a recap and next steps after the ${when} meeting.`, dueDate: after }];
  for (const r of rows) { const [ex] = await db.select().from(schema.taskSuggestions).where(eq(schema.taskSuggestions.sourceKey, r.sourceKey)).limit(1);
    if (!ex) await db.insert(schema.taskSuggestions).values({ ...r, userId, contactId, companyId, meetingTitle: title, meetingAt: start }).onConflictDoNothing();
    else if (ex.status === "new") await db.update(schema.taskSuggestions).set({ dueDate: r.dueDate, notes: r.notes, title: r.title, meetingAt: start, meetingTitle: title }).where(eq(schema.taskSuggestions.id, ex.id)); }
}

type CalEv = { id: string; status?: string; summary?: string; description?: string; location?: string; hangoutLink?: string; start?: { dateTime?: string; date?: string }; attendees?: { email?: string; self?: boolean }[]; organizer?: { email?: string } };
