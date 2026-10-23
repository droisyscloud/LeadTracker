import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { loadStory } from "@/lib/stories";
import { aiConfigured } from "@/lib/config";
import { complete, parseJson } from "@/lib/llm";
import { company, who } from "@/lib/brand";

export const maxDuration = 60;
/** ✨ Summarize a note: what happened, key points and next steps, from its text, voice transcripts and the people found. Saved with the note. */
export const POST = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("viewer"); const { id } = await params; const s = await loadStory(me, id);
  if (!aiConfigured()) throw new HttpError(503, "AI isn't set up on the server yet.");
  const items = await db.select().from(schema.storyItems).where(eq(schema.storyItems.storyId, id)).orderBy(asc(schema.storyItems.createdAt));
  const ev = s.eventId ? (await db.select({ name: schema.events.name }).from(schema.events).where(eq(schema.events.id, s.eventId)).limit(1))[0]?.name : "";
  const lines = items.map((i) => { const who = i.found.map((f) => [f.name, f.title, f.company, f.email].filter(Boolean).join(", ")).join("; ");
    return `- ${i.kind === "note" ? "Note" : i.kind === "voice" ? "Voice note" : i.kind === "card" ? "Business card" : "Photo"}${i.text ? `: ${i.text.slice(0, 2500)}` : ""}${who ? ` [people: ${who}]` : ""}`; });
  if (!lines.length) throw new HttpError(400, "This note is empty.");
  const us = await company();
  const j = parseJson<{ summary?: string; keyPoints?: string[]; nextSteps?: unknown[] }>(await complete({ maxTokens: 700, prompt: `NOTE SUMMARY. A salesperson at ${who(us)} captured this${ev ? ` at ${ev}` : ""}:
${lines.join("\n")}
Today is ${new Date().toISOString().slice(0, 10)}.
Reply ONLY with JSON: {"summary": "2-3 sentences: who they met and what matters", "keyPoints": ["up to 5 short facts"], "nextSteps": [{"text": "a concrete follow-up, starting with a verb", "due": "YYYY-MM-DD if a time was mentioned (resolve words like Friday or next week), else null"}]} (up to 4 next steps). Only use what's here; don't invent.` }), "{");
  // a step without a date is due in two working days
  const soon = () => { const d = new Date(); let n = 0; while (n < 2) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) n++; } return d.toISOString().slice(0, 10); };
  const steps = (Array.isArray(j.nextSteps) ? j.nextSteps : []).slice(0, 4).map((x: unknown) => typeof x === "string" ? { text: x, due: null } : x as { text?: string; due?: string | null });
  const summary = { summary: String(j.summary || "").slice(0, 1500), keyPoints: (Array.isArray(j.keyPoints) ? j.keyPoints : []).slice(0, 5).map(String),
    nextSteps: steps.map((x) => String(x.text || "")).filter(Boolean), dues: steps.map((x) => (/^\d{4}-\d{2}-\d{2}$/.test(String(x.due || "")) ? String(x.due) : soon())), at: Date.now() };
  const kept = s.summary?.dismissed || [];   // steps you dismissed, and tasks you made, are kept after a refresh
  const out = { ...summary, dismissed: kept, tasks: s.summary?.tasks || {} };
  await db.update(schema.stories).set({ summary: out }).where(eq(schema.stories.id, id));
  return ok(out);
});

/** Dismiss a suggested next step (it stays dismissed, even after Refresh), or bring one back. */
export const PATCH = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("viewer"); const { id } = await params; const s = await loadStory(me, id);
  const d = await body(req, z.object({ dismiss: z.string().max(500).optional(), restore: z.string().max(500).optional(), task: z.object({ title: z.string().max(500), id: z.string().uuid() }).optional() }));
  if (!s.summary) throw new HttpError(400, "Summarize the note first.");
  const set = new Set(s.summary.dismissed || []); if (d.dismiss) set.add(d.dismiss); if (d.restore) set.delete(d.restore);
  const summary = { ...s.summary, dismissed: [...set], tasks: { ...(s.summary.tasks || {}), ...(d.task ? { [d.task.title]: d.task.id } : {}) } }; await db.update(schema.stories).set({ summary }).where(eq(schema.stories.id, id));
  return ok(summary);
});
