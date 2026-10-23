import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
/** Public 1x1 pixel that records email opens. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    await db.update(schema.activities)
      .set({ openCount: sql`${schema.activities.openCount} + 1`, openedAt: sql`coalesce(${schema.activities.openedAt}, now())` })
      .where(eq(schema.activities.trackToken, token));
  } catch (e) { console.error("track failed", e); }
  return new Response(new Uint8Array(GIF), { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0" } });
}
