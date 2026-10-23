import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor, requireCompany, requireContact, requireDeal, requireTask } from "@/lib/access";
import { crmConfigured, pushToHubspot } from "@/lib/hubspot";
export const POST = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("rep");
  if (!crmConfigured()) throw new HttpError(501, "HubSpot is not configured on this server.");
  const { id } = await params;
  await requireContact(me, id, "write");
  try { return ok({ crmId: await pushToHubspot(id) }); } catch (e) { throw new HttpError(502, e instanceof Error ? e.message : "HubSpot push failed"); }
});
