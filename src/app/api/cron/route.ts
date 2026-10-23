import { HttpError, ok, route } from "@/lib/http";
import { getCurrentUser } from "@/lib/session";
import { JOBS, runAll, runJob, type Job } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
/** Runs background jobs. Call with "Authorization: Bearer CRON_SECRET" from a scheduler, or as a signed-in admin. */
async function handle(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const secretOk = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!secretOk) { const u = await getCurrentUser(); if (!u || u.role !== "admin") throw new HttpError(401, "Not allowed."); }
  const job = new URL(req.url).searchParams.get("job");
  if (job && !JOBS.includes(job as Job)) throw new HttpError(400, `Unknown job. Use one of: ${JOBS.join(", ")}`);
  return ok(job ? { [job]: await runJob(job as Job) } : await runAll());
}
export const GET = route(handle);
export const POST = route(handle);
