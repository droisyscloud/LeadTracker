import { z } from "zod";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { getState, setState } from "@/lib/jobstate";
import { audit } from "@/lib/audit";

/** Company finance settings: the month the financial year starts (1 = January). */
export const PATCH = route(async (req: Request) => {
  const me = await requireUser("admin"); const d = await body(req, z.object({ fiscalStart: z.number().int().min(1).max(12) }));
  const cur = ((await getState("finance")) || {}) as Record<string, unknown>;
  await setState("finance", { ...cur, fiscalStart: d.fiscalStart });
  await audit(me.id, "settings.finance", "settings", null, d);
  return ok(d);
});
