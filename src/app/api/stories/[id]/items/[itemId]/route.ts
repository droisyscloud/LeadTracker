import { eq } from "drizzle-orm";
import { z } from "zod";
import { after } from "next/server";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { findInText, loadStory } from "@/lib/stories";
import { deleteFile } from "@/lib/storage";
import { itemDTO } from "../../route";

type Ctx = { params: Promise<{ id: string; itemId: string }> };
async function item(storyId: string, itemId: string) { const [i] = await db.select().from(schema.storyItems).where(eq(schema.storyItems.id, itemId)).limit(1); if (!i || i.storyId !== storyId) throw new HttpError(404, "Not found."); return i; }
/** Edit a note or a voice note's text. People found in it are looked for again, keeping what you've already decided. */
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser("rep"); const { id, itemId } = await params; await loadStory(me, id, true); const cur = await item(id, itemId);
  const d = await body(req, z.object({ text: z.string().max(20000) }));
  const [it] = await db.update(schema.storyItems).set({ text: d.text, editedAt: new Date() }).where(eq(schema.storyItems.id, itemId)).returning();
  // look for newly named people after replying; keep decisions already made
  if (cur.kind === "note" || cur.kind === "voice") after(async () => { try { const fresh = await findInText(d.text); const decided = cur.found.filter((f) => f.status !== "new");
    await db.update(schema.storyItems).set({ found: [...decided, ...fresh.filter((f) => !decided.some((x) => x.name.toLowerCase() === f.name.toLowerCase()))] }).where(eq(schema.storyItems.id, itemId)); } catch { /* keep the old list */ } });
  return ok(itemDTO(id, it));
});
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser("rep"); const { id, itemId } = await params; await loadStory(me, id, true); const cur = await item(id, itemId);
  await db.delete(schema.storyItems).where(eq(schema.storyItems.id, itemId)); if (cur.storageKey) await deleteFile(cur.storageKey).catch(() => undefined);
  return ok({ deleted: true });
});
