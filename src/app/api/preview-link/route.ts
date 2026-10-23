import { z } from "zod";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { addPreview } from "@/lib/previewLinks";

export const maxDuration = 60;
const FILE = /^\/api\/((files|email-attachments)\/[\w-]+|[\w/-]+\/(file|pdf|attachment))$/;
/** A 10-minute private link to a file you can open, so Microsoft's Office viewer can show it (PowerPoint). */
export const POST = route(async (req: Request) => {
  await requireUser("viewer");
  const d = await body(req, z.object({ path: z.string().max(500) }));
  const u = new URL(d.path, req.url); if (!FILE.test(u.pathname)) throw new HttpError(400, "That isn't a file.");
  // open the file exactly as you would (same sign-in, same access rules); only if that works is a link made
  const r = await fetch(new URL(u.pathname + u.search, req.url), { headers: { cookie: req.headers.get("cookie") || "" } });
  if (!r.ok) throw new HttpError(r.status === 404 ? 404 : 403, "You can't open this file.");
  const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 50 * 1024 * 1024) throw new HttpError(413, "This file is too large to preview. Download it instead.");
  const cd = r.headers.get("content-disposition") || ""; const name = decodeURIComponent((cd.match(/filename\*=UTF-8''([^;]+)/i)?.[1] || cd.match(/filename="?([^";]+)"?/i)?.[1] || "file").trim());
  const token = addPreview(buf, r.headers.get("content-type") || "application/octet-stream", name);
  return ok({ url: new URL(`/api/public/preview/${token}/${encodeURIComponent(name)}`, process.env.APP_URL || process.env.AUTH_URL || req.url).toString(), expiresIn: 600 });
});
