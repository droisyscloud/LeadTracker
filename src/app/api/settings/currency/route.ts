import { z } from "zod";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { getFx, refreshFx, saveFxSettings } from "@/lib/fx";
import { audit } from "@/lib/audit";

export const GET = route(async () => { await requireUser("viewer"); return ok(await getFx()); });
/** Base currency and hand-set rates (admins). */
export const PATCH = route(async (req: Request) => {
  const me = await requireUser("admin");
  const d = await body(req, z.object({ base: z.string().trim().length(3).toUpperCase().optional(), manual: z.record(z.string().length(3), z.number().positive().max(1e7)).optional() }));
  await saveFxSettings(d); await audit(me.id, "settings.currency", "settings", null, { base: d.base, manual: d.manual ? Object.keys(d.manual) : undefined });
  return ok(await getFx());
});
/** Refresh today's rates now. */
export const POST = route(async () => { await requireUser("admin"); const r = await refreshFx(); return ok({ ...r, fx: await getFx() }); });
