import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { FoundPerson } from "@/db/schema";
import { HttpError } from "./http";
import { aiConfigured } from "./config";
import { complete, parseJson } from "./llm";
import { scanBadges } from "./ai";
import { websiteFromEmail } from "./normalize";
import { getFile } from "./storage";
import { transcribe } from "./llm";
import { addNotifications } from "./notify";

type Me = { id: string; role: string };
/** Your stories, or ones shared with the team; admins can see all. Only the owner (or an admin) changes them. */
export async function loadStory(me: Me, id: string, write = false) {
  const [s] = await db.select().from(schema.stories).where(eq(schema.stories.id, id)).limit(1);
  if (!s || (s.createdById !== me.id && !s.shared && !(s.sharedWith || []).includes(me.id) && me.role !== "admin")) throw new HttpError(404, "Note not found.");
  if (s.draft && s.createdById !== me.id) throw new HttpError(404, "Note not found.");   // drafts are private to the person writing them
  if (write && s.createdById !== me.id && me.role !== "admin") throw new HttpError(403, "Only the person who made this note can change it.");
  return s;
}
const clean = (p: Partial<FoundPerson>, from: FoundPerson["from"]): FoundPerson => ({ name: String(p.name || "").trim().slice(0, 200), title: String(p.title || "").trim().slice(0, 200), company: String(p.company || "").trim().slice(0, 200),
  email: String(p.email || "").trim().toLowerCase().slice(0, 320), phone: String(p.phone || "").trim().slice(0, 60), website: String(p.website || websiteFromEmail(String(p.email || "")) || "").slice(0, 200), from, status: "new" });
/** Read a business card or a photo (name badges) for people. Photos of just people find nobody, which is fine. */
export async function findInImage(buf: Buffer, type: string, from: "card" | "photo"): Promise<FoundPerson[]> {
  if (!aiConfigured() || !/^image\/(png|jpeg|webp|gif)$/.test(type)) return [];
  const people = await scanBadges([{ data: buf.toString("base64"), mediaType: type as "image/jpeg" }]);
  return people.filter((p) => p.name && (from === "card" || p.company || p.email || p.title)).map((p) => clean(p, from));
}
/** People mentioned in a voice note ("met Jake Miller, VP Ops at Gold Rush…"). */
export async function findInText(text: string): Promise<FoundPerson[]> {
  if (!aiConfigured() || text.trim().length < 12) return [];
  const j = parseJson<Partial<FoundPerson>[]>(await complete({ maxTokens: 700, prompt: `STORY PEOPLE. A salesperson at an event recorded this note:
"""${text.slice(0, 5000)}"""
List each person they MET (by name) with anything said about them. Reply ONLY with a JSON array: [{"name": "", "title": "", "company": "", "email": "", "phone": ""}]. Leave unknown fields empty; never invent emails or phones. Reply [] if nobody is named.` }), "[");
  return (Array.isArray(j) ? j : []).filter((p) => p && p.name).slice(0, 10).map((p) => clean(p, "voice"));
}

/** Someone already found elsewhere in this note (same email, or same name when there's no email) is listed once. */
async function fresh(storyId: string, itemId: string, found: FoundPerson[]) {
  const seen = (await db.select({ id: schema.storyItems.id, found: schema.storyItems.found }).from(schema.storyItems).where(eq(schema.storyItems.storyId, storyId))).filter((x) => x.id !== itemId).flatMap((x) => x.found);
  const nm = (p: FoundPerson) => `n:${p.name.toLowerCase().replace(/\s+/g, " ")}`; const key = (p: FoundPerson) => (p.email ? `e:${p.email.toLowerCase()}` : nm(p));
  const have = new Set(seen.flatMap((p) => [key(p), nm(p)])); const out: FoundPerson[] = [];
  for (const p of found) { if (have.has(key(p)) || have.has(nm(p))) continue; have.add(key(p)); have.add(nm(p)); out.push(p); }
  return out;
}
/** The AI work for one item, done after it was saved: transcribe voice, read cards/badges, find people, name the note. */
export async function processItem(itemId: string) {
  const [it] = await db.select().from(schema.storyItems).where(eq(schema.storyItems.id, itemId)).limit(1); if (!it) return;
  let text = it.text; let found: FoundPerson[] = [];
  try {
    if (it.kind === "voice" && it.storageKey) { const buf = await getFile(it.storageKey);
      const t = (await transcribe(new File([new Uint8Array(buf)], it.fileName || "voice.webm", { type: it.contentType || "audio/webm" }))).trim(); if (t) text = t;
      found = await findInText(text); }
    else if ((it.kind === "card" || it.kind === "photo") && it.storageKey) found = await findInImage(await getFile(it.storageKey), it.contentType, it.kind);
    else if (it.kind === "note") found = await findInText(text);
  } catch (e) { console.error("note ai", e); await db.update(schema.storyItems).set({ aiStatus: "failed" }).where(eq(schema.storyItems.id, itemId)); return; }
  found = await fresh(it.storyId, it.id, found);
  // someone may have edited the text while AI was working: keep their version
  const [now] = await db.select({ editedAt: schema.storyItems.editedAt }).from(schema.storyItems).where(eq(schema.storyItems.id, itemId)).limit(1);
  await db.update(schema.storyItems).set({ found, aiStatus: "done", ...(now?.editedAt ? {} : { text }) }).where(eq(schema.storyItems.id, itemId));
  const [s] = await db.select().from(schema.stories).where(eq(schema.stories.id, it.storyId)).limit(1);
  if (s && found.length) {
    if (/^Note · /.test(s.title)) await db.update(schema.stories).set({ title: `${found[0].name}${found[0].company ? ` · ${found[0].company}` : ""}`.slice(0, 200) }).where(eq(schema.stories.id, s.id));
    if (s.createdById) await addNotifications([{ userId: s.createdById, kind: "reply" as const, text: `✨ Found ${found.map((f) => f.name).join(", ")} in your note. Add ${found.length === 1 ? "them" : "any of them"} as contacts?`, link: `/notes?id=${s.id}` }]);
  }
}
