import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { complete, parseJson } from "./llm";
import { aiConfigured } from "./config";
import { contactContext } from "./summary";
import { company, who } from "./brand";

export type AiAction = { action: string; why: string; kind: "email" | "call" | "meeting" | "note" | "task" | "wait"; dueInDays: number; generatedAt: number; stale: boolean };
const KINDS = ["email", "call", "meeting", "note", "task", "wait"] as const;

/**
 * The AI's one suggestion for a lead, from its whole timeline (including promises made in notes and meetings).
 * Saved and reused until the lead's data changes; peek returns what's saved without generating.
 */
export async function aiNextAction(contactId: string, userId: string, opts: { force?: boolean; peek?: boolean } = {}): Promise<AiAction | null> {
  const ctx = await contactContext(contactId, userId);
  const today = new Date().toISOString().slice(0, 10);
  const json = JSON.stringify(ctx.data);
  const hash = createHash("sha256").update(json).digest("hex");
  const key = `nba:${contactId}:for:${userId}`;
  const [hit] = await db.select().from(schema.aiSummaries).where(eq(schema.aiSummaries.key, key)).limit(1);
  const fresh = !!hit && hit.dataHash === hash;
  if (hit && (fresh || opts.peek) && !opts.force) return { ...(hit.content as Omit<AiAction, "generatedAt" | "stale">), generatedAt: hit.createdAt.getTime(), stale: !fresh };
  if (opts.peek || !aiConfigured()) return null;
  const us = await company();
  const prompt = `You suggest the single next best action for a B2B sales lead at ${who(us)}.

Today is ${today}. Read the lead and its timeline (newest first). Find what matters most right now: unanswered replies, things they asked for that weren't sent, promises we made in meetings or notes, stalled proposals, silence after a meeting, overdue follow-ups.

Return only JSON: {"action": "one short imperative sentence, max 90 characters, naming the person and the concrete thing to do", "why": "one sentence with the facts and dates from the timeline that make this the right step", "kind": "email" | "call" | "meeting" | "note" | "task" | "wait", "dueInDays": 0 to 14}
If nothing is needed yet, use kind "wait" and say when to act. Never invent facts that aren't in the data.

Lead:
${json.slice(0, 14000)}`;
  const j = parseJson<Record<string, unknown>>(await complete({ prompt, maxTokens: 300 }), "{");
  const content = { action: String(j.action || "").slice(0, 140), why: String(j.why || "").slice(0, 400), kind: (KINDS as readonly string[]).includes(String(j.kind)) ? j.kind as AiAction["kind"] : "task",
    dueInDays: Math.max(0, Math.min(14, Number(j.dueInDays) || 0)) };
  if (!content.action) return null;
  // one timestamp for both the saved copy and the answer, so the suggestion keeps the same identity (snoozes rely on it)
  const at = new Date(Math.floor(Date.now() / 1000) * 1000);
  await db.insert(schema.aiSummaries).values({ key, content, dataHash: hash, createdById: userId, createdAt: at })
    .onConflictDoUpdate({ target: schema.aiSummaries.key, set: { content, dataHash: hash, createdById: userId, createdAt: at } });
  return { ...content, generatedAt: at.getTime(), stale: false };
}
