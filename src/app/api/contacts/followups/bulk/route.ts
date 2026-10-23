import { z } from "zod";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { callRoute } from "@/lib/selfCall";
import { POST as DISMISS } from "../../[id]/followup-dismiss/route";

/** Remove follow-ups for several contacts at once, for me only (colleagues still see them). */
export const POST = route(async (req: Request) => {
  await requireUser("rep");
  const d = await body(req, z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }));
  let done = 0; const failed: string[] = [];
  for (const id of d.ids) {
    const r = await callRoute(DISMISS, req, "POST", { params: { id } });
    if (r.ok) done++; else failed.push(id);
  }
  return ok({ done, failed });
});
