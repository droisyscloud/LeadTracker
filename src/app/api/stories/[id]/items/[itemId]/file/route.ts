import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { loadStory } from "@/lib/stories";
import { getFile } from "@/lib/storage";
import { serveBuffer } from "@/lib/serve";

export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) => {
  const me = await requireUser("viewer"); const { id, itemId } = await params; await loadStory(me, id);
  const [i] = await db.select().from(schema.storyItems).where(eq(schema.storyItems.id, itemId)).limit(1);
  if (!i || i.storyId !== id || !i.storageKey) throw new HttpError(404, "Not found.");
  return serveBuffer(req, await getFile(i.storageKey), i.fileName || "capture", i.contentType);
});
