import Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "./http";

/**
 * One place that talks to an AI provider. Set ANTHROPIC_API_KEY or OPENAI_API_KEY (or both, and choose with
 * AI_PROVIDER=anthropic|openai). Every AI feature in the app goes through complete().
 */
export type Provider = "anthropic" | "openai";
export function aiProvider(): Provider | null {
  const want = (process.env.AI_PROVIDER || "").toLowerCase();
  if (want === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (want === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}
export type Img = { data: string; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif" };

export async function complete(opts: { prompt: string; images?: Img[]; maxTokens?: number }): Promise<string> {
  const p = aiProvider();
  if (!p) throw new HttpError(501, "AI is not configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY on the server.");
  const max = opts.maxTokens ?? 800;
  if (p === "anthropic") {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 6 });
    const content: Anthropic.ContentBlockParam[] = [
      ...(opts.images || []).map((i) => ({ type: "image" as const, source: { type: "base64" as const, media_type: i.mediaType, data: i.data } })),
      { type: "text", text: opts.prompt },
    ];
    try {
      const m = await client.messages.create({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: max, messages: [{ role: "user", content }] });
      return m.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    } catch (e) { throw friendly("Anthropic", e); }
  }
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const content = [
    { type: "text", text: opts.prompt },
    ...(opts.images || []).map((i) => ({ type: "image_url", image_url: { url: `data:${i.mediaType};base64,${i.data}` } })),
  ];
  let r!: Response;
  // busy (rate limit) or a hiccup: wait and try again, up to 5 times, instead of failing straight away
  for (let attempt = 0; ; attempt++) {
    try {
      r = await fetch(`${base}/chat/completions`, {
        method: "POST", signal: AbortSignal.timeout(90_000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, ...(process.env.OPENAI_ORG_ID ? { "OpenAI-Organization": process.env.OPENAI_ORG_ID } : {}) },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4.1-mini", max_completion_tokens: max, messages: [{ role: "user", content }] }),
      });
    } catch (e) { if (attempt < 3) { await new Promise((ok) => setTimeout(ok, 2000 * (attempt + 1))); continue; } throw friendly("OpenAI", e); }
    if ((r.status === 429 || r.status >= 500) && attempt < 5) {
      const peek = r.status === 429 ? await r.clone().text().catch(() => "") : "";
      if (/insufficient_quota|billing/i.test(peek)) break;   // out of credit: waiting won't help
      const ra = Number(r.headers.get("retry-after")) || 0; await new Promise((ok) => setTimeout(ok, Math.min(30_000, ra ? ra * 1000 : 1500 * 2 ** attempt))); continue;
    }
    break;
  }
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    console.error("OpenAI error", r.status, txt.slice(0, 500));
    if (r.status === 401) throw new HttpError(502, "OpenAI rejected the API key. Check OPENAI_API_KEY in the server settings.");
    if (r.status === 429) throw new HttpError(502, /quota|billing/i.test(txt) ? "The OpenAI account has no credit left. Add credit at platform.openai.com > Billing." : "OpenAI is busy. Try again in a minute.");
    if (r.status === 404) throw new HttpError(502, `OpenAI does not offer the model "${process.env.OPENAI_MODEL || "gpt-4.1-mini"}" to this account. Set OPENAI_MODEL to one it does.`);
    throw new HttpError(502, "The AI service did not respond. Try again in a minute.");
  }
  const j = (await r.json()) as { choices?: { message?: { content?: string | null } }[] };
  return j.choices?.[0]?.message?.content || "";
}

function friendly(name: string, e: unknown): HttpError {
  console.error(`${name} error`, e);
  const s = e instanceof Error ? e.message : String(e);
  if (/401|authentication|api key/i.test(s)) return new HttpError(502, `${name} rejected the API key. Check it in the server settings.`);
  if (/429|rate|quota|credit/i.test(s)) return new HttpError(502, `${name} is busy or out of credit. Try again shortly.`);
  return new HttpError(502, "The AI service did not respond. Try again in a minute.");
}

export function parseJson<T>(t: string, open: "{" | "["): T {
  const close = open === "{" ? "}" : "]";
  const a = t.indexOf(open), b = t.lastIndexOf(close);
  if (a < 0 || b < a) throw new HttpError(502, "The AI response could not be read. Try again.");
  try { return JSON.parse(t.slice(a, b + 1)) as T; } catch { throw new HttpError(502, "The AI response could not be read. Try again."); }
}

/** Speech to text for meeting recordings. Needs OpenAI (Anthropic has no transcription service). */
export async function transcribe(file: File): Promise<string> {
  if (!process.env.OPENAI_API_KEY) throw new HttpError(501, "Turning a recording into text needs an OpenAI key (OPENAI_API_KEY). You can still paste typed notes.");
  if (file.size > 25 * 1024 * 1024) throw new HttpError(413, "Recordings can be up to 25 MB (about 20 minutes). Split longer meetings into parts.");
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const fd = new FormData();
  fd.append("file", file, file.name || "meeting.webm");
  fd.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1");
  let r: Response;
  try { r = await fetch(`${base}/audio/transcriptions`, { method: "POST", body: fd, headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(180_000) }); }
  catch (e) { throw friendly("OpenAI", e); }
  if (!r.ok) {
    const txt = await r.text().catch(() => ""); console.error("transcribe error", r.status, txt.slice(0, 400));
    if (r.status === 400) throw new HttpError(400, "OpenAI could not read that recording. Try an MP3, M4A, WAV or WebM file.");
    if (r.status === 401) throw new HttpError(502, "OpenAI rejected the API key. Check OPENAI_API_KEY.");
    if (r.status === 429) throw new HttpError(502, "OpenAI is busy or out of credit. Try again shortly.");
    throw new HttpError(502, "The recording could not be transcribed. Try again in a minute.");
  }
  const j = (await r.json()) as { text?: string };
  return (j.text || "").trim();
}
