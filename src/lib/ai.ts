import { complete, parseJson, type Img } from "./llm";

export async function draftEmail(prompt: string): Promise<{ subject: string; body: string }> {
  const j = parseJson<{ subject?: string; body?: string }>(await complete({ prompt, maxTokens: 800 }), "{");
  return { subject: String(j.subject || ""), body: String(j.body || "").replace(/\u2014/g, ", ") };
}

export type ScannedLead = { name: string; title: string; company: string; email: string; phone: string };
export async function scanBadges(images: Img[]): Promise<ScannedLead[]> {
  const prompt = 'These images are event badges, business cards or screenshots from a badge-scanning app. Extract every person shown. Return only a JSON array of objects with keys: name, title, company, email, phone (digits as shown, keep a leading country code, empty string if missing). Fix capitalisation of titles (for example "Ceo" becomes "CEO"). No commentary.';
  const arr = parseJson<Partial<ScannedLead>[]>(await complete({ prompt, images, maxTokens: 2000 }), "[");
  return arr.filter((x) => x && x.name).map((x) => ({
    name: String(x.name), title: String(x.title || ""), company: String(x.company || ""),
    email: String(x.email || ""), phone: String(x.phone || ""),
  }));
}
