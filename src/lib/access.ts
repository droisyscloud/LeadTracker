import { eq, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Role } from "@/db/schema";
import { HttpError } from "./http";

/**
 * Who can see what.
 *
 * - Admin: everything.
 * - Manager: everything in the teams they belong to or lead (leads tagged to those teams, and leads, deals and
 *   tasks owned by any member), unassigned leads waiting to be handed out, and anything shared with them.
 * - Sales rep: only leads they own, plus leads shared with them (a task about the lead assigned or tagged to
 *   them, or an @mention in the lead's discussion). No team pages.
 * - Viewer: only leads assigned to them (and shared with them), read-only.
 *
 * "Shared" leads are read and comment only; changing a lead needs ownership (or manager rights over it).
 * Anything a person cannot see answers 404, so its existence isn't revealed.
 */
type Me = { id: string; role: Role };
export type Access = {
  me: Me; all: boolean; teamIds: Set<string>; memberIds: Set<string>;
  contactIds: Set<string>; writableContactIds: Set<string>; dealIds: Set<string>; companyIds: Set<string>; taskIds: Set<string>;
  canSeeContact: (id: string | null | undefined) => boolean; canEditContact: (id: string | null | undefined) => boolean;
  canSeeDeal: (id: string) => boolean; canSeeCompany: (id: string | null | undefined) => boolean; canSeeTask: (id: string) => boolean; canSeeTeam: (id: string) => boolean;
};

export async function accessFor(me: Me): Promise<Access> {
  const [contacts, deals, tasks, companies] = await Promise.all([
    db.select({ id: schema.contacts.id, ownerId: schema.contacts.ownerId, teamId: schema.contacts.teamId, companyId: schema.contacts.companyId, personal: schema.contacts.personal, createdById: schema.contacts.createdById }).from(schema.contacts),
    db.select({ id: schema.deals.id, ownerId: schema.deals.ownerId, teamId: schema.deals.teamId, contactId: schema.deals.contactId, companyId: schema.deals.companyId }).from(schema.deals),
    db.select({ id: schema.tasks.id, contactId: schema.tasks.contactId, contactIds: schema.tasks.contactIds, companyId: schema.tasks.companyId, assigneeId: schema.tasks.assigneeId, createdById: schema.tasks.createdById }).from(schema.tasks),
    db.select({ id: schema.companies.id, createdById: schema.companies.createdById }).from(schema.companies),
  ]);
  const all = me.role === "admin";
  // someone else's personal contact: nobody else sees it (not admins, not super admins), nor its deals and tasks
  const hidden = new Set(contacts.filter((c) => c.personal && c.createdById !== me.id).map((c) => c.id));
  const mineP = new Set(contacts.filter((c) => c.personal && c.createdById === me.id).map((c) => c.id));
  const teamIds = new Set<string>(), memberIds = new Set<string>([me.id]);
  if (all) {
    const ids = (s: { id: string }[]) => new Set(s.map((x) => x.id));
    const cs = ids(contacts.filter((c) => !hidden.has(c.id))), ds = ids(deals.filter((d) => !(d.contactId && hidden.has(d.contactId)))), co = ids(companies),
      ts = ids(tasks.filter((t) => ![t.contactId, ...(t.contactIds || [])].some((x) => x && hidden.has(x))));
    for (const t of await db.select({ id: schema.teams.id }).from(schema.teams)) teamIds.add(t.id);
    return build(me, true, teamIds, memberIds, cs, cs, ds, co, ts);
  }
  if (me.role === "manager") {
    const led = await db.select({ id: schema.teams.id }).from(schema.teams).where(eq(schema.teams.leadId, me.id));
    const mine = await db.select({ teamId: schema.teamMembers.teamId }).from(schema.teamMembers).where(eq(schema.teamMembers.userId, me.id));
    for (const t of [...led.map((x) => x.id), ...mine.map((x) => x.teamId)]) teamIds.add(t);
    if (teamIds.size) for (const m of await db.select().from(schema.teamMembers).where(inArray(schema.teamMembers.teamId, [...teamIds]))) memberIds.add(m.userId);
  }
  // shared with me: tasks I'm on, and lead discussions that mention me
  const watching = new Set((await db.select({ taskId: schema.taskWatchers.taskId }).from(schema.taskWatchers).where(eq(schema.taskWatchers.userId, me.id))).map((w) => w.taskId));
  const myTasks = tasks.filter((t) => t.assigneeId === me.id || t.createdById === me.id || watching.has(t.id));
  const shared = new Set<string>(myTasks.flatMap((t) => [t.contactId, ...(t.contactIds || [])]).filter(Boolean) as string[]);
  // something on a lead's timeline was shared with me: I can see that lead (read and comment)
  for (const x of await db.select({ contactId: schema.activities.contactId }).from(schema.activities).where(sql`${schema.activities.sharedWith} @> ${JSON.stringify([me.id])}::jsonb`)) shared.add(x.contactId);
  const mentions = await db.select({ entityType: schema.comments.entityType, entityId: schema.comments.entityId, mentionIds: schema.comments.mentionIds }).from(schema.comments)
    .where(or(eq(schema.comments.entityType, "contact"), eq(schema.comments.entityType, "deal")));
  const mentionedDeals = new Set<string>();
  for (const c of mentions) if (c.mentionIds.includes(me.id)) (c.entityType === "contact" ? shared : mentionedDeals).add(c.entityId);

  const manager = me.role === "manager";
  const writable = new Set<string>(); const visible = new Set<string>();
  for (const c of contacts) {
    if (hidden.has(c.id)) continue;
    if (mineP.has(c.id)) { visible.add(c.id); writable.add(c.id); continue; }   // my own personal contact
    const own = c.ownerId === me.id;
    const team = manager && ((c.teamId && teamIds.has(c.teamId)) || (c.ownerId && memberIds.has(c.ownerId)) || !c.ownerId);
    if (own || team) { visible.add(c.id); if (me.role !== "viewer") writable.add(c.id); }
    else if (shared.has(c.id)) visible.add(c.id);
  }
  const dealIds = new Set<string>();
  for (const d of deals) {
    const team = manager && ((d.teamId && teamIds.has(d.teamId)) || (d.ownerId && memberIds.has(d.ownerId)));
    if (d.contactId && hidden.has(d.contactId)) continue;
    if (d.ownerId === me.id || team || (d.contactId && visible.has(d.contactId)) || mentionedDeals.has(d.id)) dealIds.add(d.id);
  }
  const companyIds = new Set<string>();
  for (const c of contacts) if (visible.has(c.id) && c.companyId) companyIds.add(c.companyId);
  for (const d of deals) if (dealIds.has(d.id) && d.companyId) companyIds.add(d.companyId);
  for (const c of companies) if (c.createdById === me.id) companyIds.add(c.id);
  const taskIds = new Set<string>(myTasks.map((t) => t.id));
  for (const t of tasks) if ([t.contactId, ...(t.contactIds || [])].some((x) => x && hidden.has(x))) taskIds.delete(t.id); else if ([t.contactId, ...(t.contactIds || [])].some((x) => x && writable.has(x)) || (manager && t.assigneeId && memberIds.has(t.assigneeId))) taskIds.add(t.id);
  return build(me, false, teamIds, memberIds, visible, writable, dealIds, companyIds, taskIds);
}

function build(me: Me, all: boolean, teamIds: Set<string>, memberIds: Set<string>, contactIds: Set<string>, writableContactIds: Set<string>, dealIds: Set<string>, companyIds: Set<string>, taskIds: Set<string>): Access {
  return {
    me, all, teamIds, memberIds, contactIds, writableContactIds, dealIds, companyIds, taskIds,
    canSeeContact: (id) => !!id && contactIds.has(id), canEditContact: (id) => !!id && writableContactIds.has(id),
    canSeeDeal: (id) => dealIds.has(id), canSeeCompany: (id) => !!id && companyIds.has(id), canSeeTask: (id) => taskIds.has(id),
    canSeeTeam: (id) => all || teamIds.has(id),
  };
}

/** Load a lead the person may see (or change, with mode "write"). Unknown or invisible leads answer 404. */
export async function requireContact(me: Me, id: string, mode: "read" | "write" = "read", acc?: Access) {
  const a = acc || await accessFor(me);
  if (!a.canSeeContact(id)) throw new HttpError(404, "Lead not found.");
  if (mode === "write" && !a.canEditContact(id)) throw new HttpError(403, me.role === "viewer" ? "Viewers can't change leads." : "This lead belongs to someone else. You can read it and comment, but only its owner or a manager can change it.");
  const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, id)).limit(1);
  if (!c) throw new HttpError(404, "Lead not found.");
  return c;
}
export async function requireDeal(me: Me, id: string, acc?: Access) {
  const a = acc || await accessFor(me);
  if (!a.canSeeDeal(id)) throw new HttpError(404, "Deal not found.");
}
export async function requireCompany(me: Me, id: string, acc?: Access) {
  const a = acc || await accessFor(me);
  if (!a.canSeeCompany(id)) throw new HttpError(404, "Company not found.");
}
export async function requireTask(me: Me, id: string, acc?: Access) {
  const a = acc || await accessFor(me);
  if (!a.canSeeTask(id)) throw new HttpError(404, "Task not found.");
}
