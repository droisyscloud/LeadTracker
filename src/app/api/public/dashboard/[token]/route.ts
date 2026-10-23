import { HttpError, ok, route } from "@/lib/http";
import { dashboardData } from "@/lib/reportJobs";

export const dynamic = "force-dynamic";
/** A shared dashboard's live numbers, for anyone with the link (while it's switched on). */
export const GET = route(async (_req: Request, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params;
  const d = await dashboardData(token);
  if (!d) throw new HttpError(404, "This dashboard link isn't available.");
  return ok(d);
});
