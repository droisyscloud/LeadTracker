import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor } from "@/lib/access";
import { aiNextAction } from "@/lib/nextActionAI";
import { aiConfigured } from "@/lib/config";

type Ctx = { params: Promise<{ id: string }> };
async function check(id: string, me: Awaited<ReturnType<typeof requireUser>>) { const acc = await accessFor(me); if (!acc.canSeeContact(id)) throw new HttpError(404, "Lead not found."); }
/** The saved AI suggestion for a lead (without generating a new one). */
export const GET = route(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser("viewer"); const { id } = await params; await check(id, me);
  return ok({ ai: aiConfigured(), suggestion: await aiNextAction(id, me.id, { peek: true }) });
});
/** Ask AI for a fresh suggestion (only regenerates when the lead's data changed, unless forced). */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const me = await requireUser("rep"); const { id } = await params; await check(id, me);
  if (!aiConfigured()) throw new HttpError(400, "AI isn't turned on.");
  const force = new URL(req.url).searchParams.get("force") === "1";
  try { return ok({ ai: true, suggestion: await aiNextAction(id, me.id, { force }) }); }
  catch (e) { console.error("next action failed", e); throw new HttpError(502, "AI couldn't suggest a next step just now. Try again in a minute."); }
});
