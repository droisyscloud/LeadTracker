import type { ContactDTO } from "@/lib/types";
import { coName, firstName, type Model } from "./model";

/**
 * Quick checks before an email goes out: unfilled placeholders, a greeting with the wrong name, an attachment
 * mentioned but missing, another customer's company named, and not answering what they asked for.
 */
export function emailIssues(m: Model, c: ContactDTO, subject: string, body: string, attached: number): string[] {
  const out: string[] = []; const all = `${subject}\n${body}`; const first = (firstName(c.name) || "").toLowerCase();
  const ph = all.match(/\{\{?\s*[a-z_ ]+\s*\}?\}|\[(?:first ?name|name|company|date|title|x+|insert[^\]]*)\]|<<[^>]*>>|\bTBD\b|\bX{3,}\b|\bINSERT\b/i);
  if (ph) out.push(`It still has a placeholder: "${ph[0]}".`);
  const g = body.match(/^\s*(?:hi|hello|dear|hey|good (?:morning|afternoon|evening))[ ,]+([A-Za-z][\w'-]+)/im);
  if (g && first && !["team", "all", "there", "everyone", "folks", "sir", "madam"].includes(g[1].toLowerCase()) && g[1].toLowerCase() !== first && g[1].toLowerCase() !== c.name.toLowerCase().split(" ").slice(-1)[0])
    out.push(`The greeting says "${g[1]}", but this email is to ${firstName(c.name)}.`);
  if (/\b(attached|attachment|enclosed|please find)\b/i.test(body) && !attached) out.push("It mentions an attachment, but nothing is attached.");
  const mine = (coName(m, c) || "").toLowerCase();
  const other = m.companies.find((co) => co.name.length >= 4 && co.name.toLowerCase() !== mine && new RegExp(`\\b${co.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(all));
  if (other) out.push(`It mentions ${other.name}, but ${firstName(c.name)} is at ${coName(m, c) || "another company"}. Is that right?`);
  const acts = m.actsByContact.get(c.id) || [];
  const req = acts.filter((a) => a.type === "request").sort((a, b) => b.at - a.at)[0];
  const sentAfter = req && acts.some((a) => a.type === "email" && a.at > req.at);
  if (req && !sentAfter) {
    const words = `${req.subject} ${req.body}`.toLowerCase().match(/\b(price|pricing|quote|brochure|proposal|demo|trial|case stud\w*|deck|contract|sow|nda|specs?|datasheet|presentation)\b/g) || [];
    const key = [...new Set(words.map((w) => w.replace(/pricing/, "price")))];
    if (key.length && !key.some((k) => all.toLowerCase().includes(k.slice(0, 5)))) out.push(`${firstName(c.name)} asked for "${req.subject || req.body.slice(0, 40)}", and this email doesn't mention it.`);
  }
  if (body.replace(/\s+/g, " ").trim().length < 20) out.push("The message is almost empty.");
  return out;
}
