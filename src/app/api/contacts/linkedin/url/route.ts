import { z } from "zod";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { webSearch } from "@/lib/webSearch";
import { parseJson } from "@/lib/llm";
import { cleanLinkedIn } from "@/lib/linkedin";

export const maxDuration = 120;
/** Paste a LinkedIn profile link: keep the link, and fill in what the public web shows for that exact profile. */
export const POST = route(async (req: Request) => {
  await requireUser("rep");
  const d = await body(req, z.object({ url: z.string().trim().min(10).max(500) }));
  const url = cleanLinkedIn(d.url); if (!url) throw new HttpError(400, "That doesn't look like a LinkedIn profile link (it should look like linkedin.com/in/their-name).");
  let j: { name?: string; title?: string; company?: string; location?: string; background?: string } = {};
  try { j = parseJson(await webSearch(`LINKEDIN READ URL. Look up this exact LinkedIn profile on the public web: ${url}
Reply ONLY with JSON: {"name": "", "title": "current job title", "company": "current company", "location": "", "background": "2-3 sentences: current role, past companies, focus"}. Use "" for anything you can't see.`), "{"); } catch { j = {}; }
  const s = (v: unknown) => String(v || "").trim().slice(0, 300);
  return ok({ linkedinUrl: url, name: s(j.name), title: s(j.title), company: s(j.company), location: s(j.location), background: String(j.background || "").trim().slice(0, 1200) });
});
