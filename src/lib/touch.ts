import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { advancedStage } from "./leads";
import { fireWebhook } from "./webhooks";

/** After any activity: bump last touch, advance the stage, claim unowned leads, stop sequences on a reply. */
export async function recordTouch(contactId: string, type: string, opts: { byId?: string | null; outcome?: string | null; at?: Date; nextFollowUp?: string | null } = {}) {
  const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, contactId)).limit(1);
  if (!c) return;
  const at = opts.at || new Date();
  const patch: Partial<typeof schema.contacts.$inferInsert> = { updatedAt: new Date() };
  if (!c.lastTouchAt || c.lastTouchAt < at) patch.lastTouchAt = at;
  const next = advancedStage(c.status, type, opts.outcome);
  if (next !== c.status) patch.status = next;
  if (!c.ownerId && opts.byId && !["note", "file", "reply"].includes(type)) patch.ownerId = opts.byId;
  const today = new Date().toISOString().slice(0, 10);
  if (opts.nextFollowUp) patch.nextFollowUp = opts.nextFollowUp;
  else if (c.nextFollowUp && c.nextFollowUp <= today && ["email", "call", "meeting"].includes(type)) patch.nextFollowUp = null;
  await db.update(schema.contacts).set(patch).where(eq(schema.contacts.id, contactId));
  if (patch.status) await fireWebhook("contact.stage_changed", { contactId, from: c.status, to: patch.status });
  if (type === "reply") {
    await db.update(schema.enrollments).set({ status: "stopped", stoppedReason: "Replied", nextAt: null })
      .where(and(eq(schema.enrollments.contactId, contactId), eq(schema.enrollments.status, "active")));
  }
}
