import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor } from "@/lib/access";
import { meetingBrief } from "@/lib/meetingPrep";
import { aiConfigured } from "@/lib/config";

type Ctx = { params: Promise<{ id: string }> };
async function check(id: string, me: Awaited<ReturnType<typeof requireUser>>) { const acc = await accessFor(me); if (!acc.canSeeContact(id)) throw new HttpError(404, "Lead not found."); }
export const GET = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser("viewer"); const { id } = await params; await check(id, me);
  return ok({ ai: aiConfigured(), brief: await meetingBrief(id, me.id, { peek: true }) });
});
/** Prepare (or refresh) the brief for meeting this lead. */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser("viewer"); const { id } = await params; await check(id, me);
  if (!aiConfigured()) throw new HttpError(400, "AI isn't turned on.");
  const q = new URL(req.url).searchParams; const at = Number(q.get("at")) || null;
  try { return ok({ ai: true, brief: await meetingBrief(id, me.id, { force: q.get("force") === "1", meetingAt: at }) }); }
  catch (e) { console.error("brief failed", e); throw new HttpError(502, "AI couldn't prepare the brief just now. Try again in a minute."); }
});
