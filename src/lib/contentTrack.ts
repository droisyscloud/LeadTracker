import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { addNotifications } from "./notify";

const fmtDur = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`);
/** Plain summary of one viewing session. */
export function viewSummary(pages: Record<string, number>, total: number, ofPages: number) {
  const read = Object.entries(pages).filter(([, s]) => s >= 2);
  const top = read.sort((a, b) => b[1] - a[1])[0];
  return `Read ${read.length} of ${ofPages} page${ofPages === 1 ? "" : "s"}, ${fmtDur(total)}${top ? `; longest on page ${top[0]} (${fmtDur(top[1])})` : ""}`;
}
/**
 * Record reading: the first ping of a session adds "Opened <doc>" to the lead's timeline and tells its owner;
 * later pings add time to the page being read and update the timeline entry.
 */
export async function recordView(token: string, viewId: string | null, page: number, seconds: number) {
  const [link] = await db.select().from(schema.contentLinks).where(eq(schema.contentLinks.token, token)).limit(1);
  if (!link) return null;
  const [doc] = await db.select().from(schema.content).where(eq(schema.content.id, link.contentId)).limit(1);
  if (!doc) return null;
  const add = Math.max(0, Math.min(60, Math.round(seconds))); const p = String(Math.max(1, Math.min(doc.pages, Math.round(page))));
  let view = viewId ? (await db.select().from(schema.contentViews).where(eq(schema.contentViews.id, viewId)).limit(1))[0] : undefined;
  if (view && view.linkId !== link.id) view = undefined;
  if (!view) {
    [view] = await db.insert(schema.contentViews).values({ linkId: link.id, pages: { [p]: add }, seconds: add }).returning();
    if (link.contactId) {
      const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, link.contactId)).limit(1);
      if (c) {
        const [a] = await db.insert(schema.activities).values({ contactId: c.id, type: "note", subject: `Opened “${doc.name}”`, body: "Just opened it.", byId: null, kind: "Content viewed" }).returning();
        await db.update(schema.contentViews).set({ activityId: a.id }).where(eq(schema.contentViews.id, view.id));
        view.activityId = a.id;
        const to = c.ownerId || link.createdById;
        if (to) await addNotifications([{ userId: to, kind: "content", taskId: null, text: `${c.name} opened “${doc.name}”`, link: `/contacts?id=${c.id}` }]).catch(() => undefined);
      }
    }
    return { viewId: view.id };
  }
  const pages = { ...view.pages, [p]: (view.pages[p] || 0) + add }; const total = view.seconds + add;
  await db.update(schema.contentViews).set({ pages, seconds: total, lastAt: new Date() }).where(eq(schema.contentViews.id, view.id));
  if (view.activityId) await db.update(schema.activities).set({ body: viewSummary(pages, total, doc.pages) }).where(eq(schema.activities.id, view.activityId));
  return { viewId: view.id };
}
