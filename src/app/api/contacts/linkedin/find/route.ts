import { z } from "zod";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { webSearch } from "@/lib/webSearch";
import { parseJson } from "@/lib/llm";
import { cleanLinkedIn } from "@/lib/linkedin";

export const maxDuration = 120;
/** Find someone's LinkedIn profile by searching the public web. A person confirms it before it's saved. */
export const POST = route(async (req: Request) => {
  await requireUser("rep");
  const d = await body(req, z.object({ name: z.string().trim().min(2).max(200), company: z.string().trim().max(200).default(""), title: z.string().trim().max(200).default(""), email: z.string().trim().max(320).default(""), location: z.string().trim().max(200).default("") }));
  const dom = d.email.includes("@") ? d.email.split("@")[1] : "";
  const text = await webSearch(`LINKEDIN FIND. Search the web for LinkedIn profiles of this person, using their name together with their title and company:
Name: ${d.name}${d.title ? `\nTitle: ${d.title}` : ""}${d.company ? `\nCompany: ${d.company}` : ""}${dom ? `\nEmail domain: ${dom}` : ""}${d.location ? `\nLocation: ${d.location}` : ""}
Search for "${d.name}"${d.title ? ` "${d.title}"` : ""}${d.company ? ` "${d.company}"` : ""} on linkedin.com/in. If several different people could match, list ALL of them (up to 5), best match first:
a profile whose company AND title match is best; company only is next; name only is last. Never guess a URL you didn't see in results.
Reply ONLY with JSON: {"candidates": [{"url": "https://www.linkedin.com/in/...", "confidence": "high" | "medium" | "low", "name": "as shown", "headline": "their current role as shown", "company": "", "location": "", "summary": "2-3 sentences from public results"}], "sources": ["up to 3 URLs you used"]}`);
  type C = { url?: string | null; confidence?: string; name?: string; headline?: string; company?: string; location?: string; summary?: string };
  let j: { candidates?: C[]; sources?: string[] } & C = {};
  try { j = parseJson(text, "{"); } catch { j = {}; }
  const raw: C[] = Array.isArray(j.candidates) ? j.candidates : j.url ? [j] : [];
  const seen = new Set<string>(); const candidates = raw.map((c) => ({ url: cleanLinkedIn(String(c.url || "")), confidence: ["high", "medium", "low"].includes(String(c.confidence)) ? String(c.confidence) : "low",
    name: String(c.name || "").slice(0, 200), headline: String(c.headline || "").slice(0, 200), company: String(c.company || "").slice(0, 200), location: String(c.location || "").slice(0, 200), summary: String(c.summary || "").slice(0, 1200) }))
    .filter((c) => c.url && !seen.has(c.url) && seen.add(c.url)).slice(0, 5);
  if (!candidates.length) { const u = cleanLinkedIn(text); if (u) candidates.push({ url: u, confidence: "low", name: "", headline: "", company: "", location: "", summary: "" }); }
  const best = candidates[0];
  return ok({ candidates, url: best?.url || null, confidence: best?.confidence || null, headline: best?.headline || "", location: best?.location || "", summary: best?.summary || "",
    sources: (Array.isArray(j.sources) ? j.sources : []).map(String).filter((s) => /^https?:\/\//.test(s)).slice(0, 3) });
});
