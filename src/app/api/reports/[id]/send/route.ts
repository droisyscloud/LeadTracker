import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { sendReport } from "@/lib/reportJobs";
import { mailConfigured } from "@/lib/config";

/** Send a scheduled report right now (to check it). */
export const POST = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("viewer"); const { id } = await params;
  const [r] = await db.select().from(schema.reports).where(eq(schema.reports.id, id)).limit(1);
  if (!r || (r.ownerId !== me.id && me.role !== "admin")) throw new HttpError(404, "Report not found.");
  if (!r.schedule) throw new HttpError(400, "Set who receives this report first.");
  if (!mailConfigured() && !r.schedule.toDrive) throw new HttpError(400, "Emails can't be sent until the outgoing mailbox is set up.");
  await sendReport(r);
  return ok({ sent: true, to: r.schedule.recipients });
});
