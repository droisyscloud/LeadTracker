import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { Stage } from "@/db/schema";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor, requireCompany, requireContact, requireDeal, requireTask } from "@/lib/access";
import { canManage } from "@/lib/rbac";
import { ensureCompany } from "@/lib/leads";
import { cleanEmail, titleCase, websiteFromEmail } from "@/lib/normalize";
import { defaultTeam } from "@/lib/teams";
import { audit } from "@/lib/audit";
import { fireWebhook } from "@/lib/webhooks";

const str = (n: number) => z.string().max(n).optional().default("");
const lead = z.object({
  row: z.number().int().optional(),
  name: z.string().trim().min(1).max(200),
  title: str(200), company: str(200), email: str(320), phone: str(60), website: str(300),
  source: str(100), referredBy: str(200), event: str(200), team: str(120), ownerEmail: str(320),
  products: z.array(z.string().max(120)).max(50).optional().default([]),
  tags: z.array(z.string().max(60)).max(30).optional().default([]),
  stage: str(40), nextFollowUp: str(20), notes: str(5000),
});
const input = z.object({
  leads: z.array(lead).min(1).max(500),
  source: z.string().max(100).default("Import"),
  eventId: z.string().uuid().nullable().default(null),
  teamId: z.string().uuid().nullable().default(null),
  duplicates: z.enum(["skip", "update"]).default("skip"),
  owner: z.enum(["me", "none", "column"]).default("me"),
});

const STAGES: Record<string, Stage> = {
  new: "new", newlead: "new", contacted: "contacted", engaged: "engaged", meeting: "meeting", meetingset: "meeting",
  proposal: "proposal", proposalsent: "proposal", won: "won", lost: "lost", notnow: "lost",
};
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const TAGS = ["Immediate follow-up", "Schedule meeting", "Send price list", "Send product brochure", "Set up trial", "Unlikely"];
const tagByKey = new Map(TAGS.map((t) => [key(t), t]));
function toDate(v: string): string | null {
  const s = v.trim(); if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // US style M/D/YYYY
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const d = new Date(s); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Bulk import from a spreadsheet, the badge scanner or another system. Returns what happened to every row. */
export const POST = route(async (req: Request) => {
  const me = await requireUser("rep");
  const acc = await accessFor(me);
  const d = await body(req, input);
  const manager = canManage(me.role);
  const [products, teams, events, users, existing] = await Promise.all([
    db.select().from(schema.products), db.select().from(schema.teams), db.select().from(schema.events),
    db.select({ id: schema.users.id, email: schema.users.email, status: schema.users.status }).from(schema.users),
    db.select({ id: schema.contacts.id, email: schema.contacts.email, tags: schema.contacts.tags }).from(schema.contacts),
  ]);
  const prodBy = new Map(products.map((p) => [key(p.name), p.id]));
  const teamBy = new Map(teams.map((t) => [key(t.name), t.id]));
  const eventBy = new Map(events.map((e) => [key(e.name), e.id]));
  const userBy = new Map(users.filter((u) => u.status === "active").map((u) => [u.email.toLowerCase(), u.id]));
  const byEmail = new Map(existing.filter((c) => c.email).map((c) => [c.email, c]));
  const myTeam = await defaultTeam(me.id);

  let created = 0, updated = 0;
  const skipped: { row: number | null; name: string; reason: string }[] = [];
  const warnings: { row: number | null; name: string; message: string }[] = [];
  const seenInFile = new Set<string>();

  for (const l of d.leads) {
    const row = l.row ?? null;
    const email = cleanEmail(l.email);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { skipped.push({ row, name: l.name, reason: `Email "${l.email}" is not valid` }); continue; }
    if (email && seenInFile.has(email)) { skipped.push({ row, name: l.name, reason: "Same email appears earlier in the file" }); continue; }
    if (email) seenInFile.add(email);

    const productIds = l.products.map((p) => { const id = prodBy.get(key(p)); if (!id && p.trim()) warnings.push({ row, name: l.name, message: `Product "${p}" not found` }); return id; }).filter(Boolean) as string[];
    const tags = l.tags.map((t) => tagByKey.get(key(t)) || t.trim()).filter(Boolean);
    const teamId = l.team ? teamBy.get(key(l.team)) ?? null : d.teamId ?? myTeam;
    if (l.team && !teamBy.get(key(l.team))) warnings.push({ row, name: l.name, message: `Team "${l.team}" not found` });
    const eventId = l.event ? eventBy.get(key(l.event)) ?? d.eventId : d.eventId;
    if (l.event && !eventBy.get(key(l.event))) warnings.push({ row, name: l.name, message: `Event "${l.event}" not found` });
    const stage = l.stage ? STAGES[key(l.stage)] : undefined;
    if (l.stage && !stage) warnings.push({ row, name: l.name, message: `Stage "${l.stage}" not recognised, left as New lead` });
    const nextFollowUp = toDate(l.nextFollowUp);
    let ownerId: string | null = d.owner === "none" ? null : me.id;
    if (d.owner === "column" && manager) {
      ownerId = l.ownerEmail ? userBy.get(l.ownerEmail.trim().toLowerCase()) ?? null : null;
      if (l.ownerEmail && !ownerId) warnings.push({ row, name: l.name, message: `Owner "${l.ownerEmail}" is not an active user, left unassigned` });
    }

    const hit = email ? byEmail.get(email) : undefined;
    if (hit && d.duplicates === "update" && !acc.canEditContact(hit.id)) { skipped.push({ row, name: l.name, reason: "Already in the tracker, owned by someone else" }); continue; }
    if (hit) {
      if (d.duplicates === "skip") { skipped.push({ row, name: l.name, reason: "Already in the tracker (same email)" }); continue; }
      const set: Partial<typeof schema.contacts.$inferInsert> = { updatedAt: new Date() };
      if (l.title) set.title = titleCase(l.title);
      if (l.phone) set.phone = l.phone;
      if (l.company) set.companyId = await ensureCompany(l.company, l.website || websiteFromEmail(email), me.id);
      if (l.referredBy) set.referredBy = l.referredBy;
      if (l.source) set.source = l.source;
      if (stage) set.status = stage;
      if (nextFollowUp) set.nextFollowUp = nextFollowUp;
      if (l.team && teamId) set.teamId = teamId;
      if (l.event && eventId) set.eventId = eventId;
      if (d.owner === "column" && manager && ownerId) set.ownerId = ownerId;
      if (tags.length) set.tags = [...new Set([...hit.tags, ...tags])];
      await db.update(schema.contacts).set(set).where(eq(schema.contacts.id, hit.id));
      if (productIds.length) await db.insert(schema.contactProducts).values(productIds.map((productId) => ({ contactId: hit.id, productId }))).onConflictDoNothing();
      if (l.notes.trim()) await db.insert(schema.activities).values({ contactId: hit.id, type: "note", body: l.notes.trim(), byId: me.id, origin: "app" });
      updated++;
      continue;
    }

    const companyId = await ensureCompany(l.company, l.website || websiteFromEmail(email), me.id);
    const [c] = await db.insert(schema.contacts).values({
      name: l.name, title: titleCase(l.title), email, phone: l.phone, companyId, ownerId, createdById: me.id,
      source: l.source || d.source, referredBy: l.referredBy, eventId, teamId, tags, status: stage || "new", nextFollowUp,
    }).returning({ id: schema.contacts.id });
    if (productIds.length) await db.insert(schema.contactProducts).values([...new Set(productIds)].map((productId) => ({ contactId: c.id, productId }))).onConflictDoNothing();
    if (l.notes.trim()) await db.insert(schema.activities).values({ contactId: c.id, type: "note", body: l.notes.trim(), byId: me.id, origin: "app" });
    if (email) byEmail.set(email, { id: c.id, email, tags });
    created++;
  }
  if (created || updated) {
    await audit(me.id, "contact.imported", "contact", null, { created, updated, skipped: skipped.length, source: d.source });
    await fireWebhook("lead.imported", { created, updated, by: me.email });
  }
  return ok({ created, updated, skipped, warnings: warnings.slice(0, 200) });
});

