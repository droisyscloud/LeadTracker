import { z } from "zod";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { getState, setState } from "@/lib/jobstate";
import { audit } from "@/lib/audit";

/** Prep and follow-up tasks for meetings found in calendars (on unless switched off). */
export const GET = route(async () => { await requireUser("viewer"); const s = ((await getState("meeting-automation")) || {}) as { enabled?: boolean }; return ok({ enabled: s.enabled !== false }); });
export const PUT = route(async (req: Request) => { const me = await requireUser("admin"); const d = await body(req, z.object({ enabled: z.boolean() }));
  await setState("meeting-automation", { enabled: d.enabled }); await audit(me.id, "settings.meeting-automation", "settings", null, { enabled: d.enabled }); return ok(d); });
