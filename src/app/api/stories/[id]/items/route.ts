import { eq } from "drizzle-orm";
import { after } from "next/server";
import { db, schema } from "@/db";
import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { loadStory, processItem } from "@/lib/stories";
import { putFile } from "@/lib/storage";
import { aiConfigured } from "@/lib/config";
import { itemDTO } from "../route";

export const maxDuration = 120;
/** Add a photo, business card, voice note or written note. It's saved at once; AI reads it afterwards (cards, badges, voice, names). */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("rep"); const { id } = await params; await loadStory(me, id, true);
  const form = await req.formData().catch(() => { throw new HttpError(400, "Send the item as a form."); });
  const kind = String(form.get("kind") || "") as "photo" | "card" | "voice" | "note"; if (!["photo", "card", "voice", "note"].includes(kind)) throw new HttpError(400, "What is it: photo, card, voice or note?");
  const text = String(form.get("text") || "").slice(0, 20000); const f = form.get("file"); let key: string | null = null, type = "", name = "";
  if (kind !== "note") { if (!f || typeof f !== "object" || !(f as File).size) throw new HttpError(400, "Nothing was captured.");
    const file = f as File; if (file.size > 25 * 1024 * 1024) throw new HttpError(413, "That's larger than 25 MB.");
    type = file.type || (kind === "voice" ? "audio/webm" : "image/jpeg"); name = file.name || kind; key = await putFile(Buffer.from(await file.arrayBuffer()), type); }
  else if (!text.trim()) throw new HttpError(400, "Write something.");
  const edited = String(form.get("edited") || "") === "1";   // you edited or polished the text before saving: AI keeps your version
  const [it] = await db.insert(schema.storyItems).values({ storyId: id, kind, storageKey: key, contentType: type, fileName: name, text, aiStatus: aiConfigured() ? "pending" : "none", createdById: me.id, editedAt: edited ? new Date() : null }).returning();
  await db.update(schema.stories).set({ updatedAt: new Date() }).where(eq(schema.stories.id, id));
  if (aiConfigured()) after(() => processItem(it.id).catch((e) => console.error("note ai", e)));   // runs after the reply, so you don't wait
  return ok(itemDTO(id, it), 201);
});
