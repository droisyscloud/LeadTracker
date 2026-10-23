import { z } from "zod";
import { body, HttpError, ok, route } from "@/lib/http";
import { recordView } from "@/lib/contentTrack";

/** The viewer reports which page is on screen and for how long (every few seconds). */
export const POST = route(async (req: Request, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params;
  const d = await body(req, z.object({ viewId: z.string().uuid().nullable().default(null), page: z.number().int().min(1).max(5000), seconds: z.number().min(0).max(120) }));
  const r = await recordView(token, d.viewId, d.page, d.seconds);
  if (!r) throw new HttpError(404, "This link isn't available.");
  return ok(r);
});
