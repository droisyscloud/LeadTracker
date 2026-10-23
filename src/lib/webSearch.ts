import Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "./http";
import { aiProvider } from "./llm";

/** Ask the AI a question it answers by searching the public web (Anthropic web search or OpenAI web search). */
export async function webSearch(prompt: string, maxTokens = 1500): Promise<string> {
  const p = aiProvider(); if (!p) throw new HttpError(501, "AI is not configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY on the server.");
  if (p === "anthropic") {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const m = await client.messages.create({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }] as never });
    return m.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
  }
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const r = await fetch(`${base}/responses`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: process.env.OPENAI_SEARCH_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini", tools: [{ type: "web_search_preview" }], input: prompt, max_output_tokens: maxTokens }) });
  const j = await r.json().catch(() => ({})) as { output_text?: string; output?: { content?: { type: string; text?: string }[] }[]; error?: { message?: string } };
  if (!r.ok) throw new HttpError(502, `Web search failed: ${j.error?.message || r.status}`);
  return j.output_text || (j.output || []).flatMap((o) => o.content || []).filter((c) => c.type === "output_text").map((c) => c.text || "").join("\n");
}
