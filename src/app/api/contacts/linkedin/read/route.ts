import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { complete, parseJson } from "@/lib/llm";
import { documentText } from "@/lib/doctext";
import { cleanLinkedIn } from "@/lib/linkedin";

export const maxDuration = 120;
/** Read a LinkedIn profile you saved as PDF (More → Save to PDF) or copied, and pull out the details. */
export const POST = route(async (req: Request) => {
  await requireUser("rep");
  const form = await req.formData().catch(() => { throw new HttpError(400, "Send the profile PDF or text."); });
  let text = String(form.get("text") || ""); const f = form.get("file");
  if (f && typeof f === "object" && (f as File).size) { const file = f as File; text = await documentText(Buffer.from(await file.arrayBuffer()), file.type || "application/pdf", file.name); }
  text = text.trim(); if (text.length < 40) throw new HttpError(422, "That doesn't look like a profile. Use LinkedIn's More → Save to PDF, or copy the whole profile page.");
  const j = parseJson<Record<string, string>>(await complete({ maxTokens: 900, prompt: `LINKEDIN READ. This is someone's LinkedIn profile (saved as PDF or copied):
"""${text.slice(0, 12000)}"""
Reply ONLY with JSON: {"name": "", "title": "current job title", "company": "current company", "location": "", "email": "only if shown", "phone": "only if shown", "url": "their linkedin.com/in/ address if shown", "background": "3-4 short sentences: current role and focus, previous companies and roles, education, anything useful for a sales conversation"}` }), "{");
  const s = (k: string, n = 200) => String(j[k] || "").trim().slice(0, n);
  return ok({ name: s("name"), title: s("title"), company: s("company"), location: s("location"), email: /@/.test(s("email")) ? s("email") : "", phone: s("phone", 60), url: cleanLinkedIn(s("url", 300)) || cleanLinkedIn(text), background: s("background", 2000) });
});
