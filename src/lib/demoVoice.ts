import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getFile, putFile } from "./storage";
import { ALL_STEPS } from "@/components/demoScript";

/**
 * Narration for the demo, spoken by a natural OpenAI voice. Each step's audio is generated the first time
 * it's needed, saved, and reused; a changed sentence gets a new recording. Without an OpenAI key the
 * player uses the device's own voice instead.
 */
const VOICE = process.env.DEMO_VOICE || "nova";
const MODEL = process.env.DEMO_VOICE_MODEL || "gpt-4o-mini-tts";
const keyFor = (text: string) => `voice:${createHash("sha256").update(`${MODEL}|${VOICE}|${text}`).digest("hex")}`;
export const voiceAvailable = () => !!process.env.OPENAI_API_KEY;

async function cached(text: string): Promise<string | null> {
  const [hit] = await db.select().from(schema.aiSummaries).where(eq(schema.aiSummaries.key, keyFor(text))).limit(1);
  return hit ? String((hit.content as { storageKey?: string }).storageKey || "") || null : null;
}
async function generate(text: string): Promise<Buffer> {
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const r = await fetch(`${base}/audio/speech`, { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, voice: VOICE, input: text, response_format: "mp3",
      instructions: "You are narrating a friendly product demo for a sales team. Warm, clear and natural, at a relaxed pace, like a helpful colleague showing someone around." }),
    signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`voice ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}
/** The audio for one step (generating and saving it if needed). Null when there's no voice available. */
export async function stepAudio(stepId: string): Promise<Buffer | null> {
  const step = ALL_STEPS.find((s) => s.id === stepId); if (!step) return null;
  const have = await cached(step.say);
  if (have) { try { return await getFile(have); } catch { /* regenerate below */ } }
  if (!voiceAvailable()) return null;
  const buf = await generate(step.say);
  const storageKey = await putFile(buf, "audio/mpeg");
  await db.insert(schema.aiSummaries).values({ key: keyFor(step.say), content: { storageKey, stepId }, dataHash: "voice" })
    .onConflictDoUpdate({ target: schema.aiSummaries.key, set: { content: { storageKey, stepId }, createdAt: new Date() } });
  return buf;
}
/** How many steps already have their narration saved. */
export async function voiceStatus() {
  let ready = 0; for (const s of ALL_STEPS) if (await cached(s.say)) ready++;
  return { available: voiceAvailable(), ready, total: ALL_STEPS.length };
}
/** Generate every step's narration now, so nobody waits the first time. */
export async function prepareAll() {
  let made = 0, failed = 0;
  for (const s of ALL_STEPS) { if (await cached(s.say)) continue; try { await stepAudio(s.id); made++; } catch (e) { failed++; console.error("voice failed", s.id, e); } }
  return { ...(await voiceStatus()), made, failed };
}
