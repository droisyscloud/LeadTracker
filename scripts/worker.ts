/**
 * Background worker: mailbox sync, sequence sends, daily digests and CRM push.
 * Run alongside the web app:  npm run worker
 * Or skip it and call POST /api/cron with "Authorization: Bearer $CRON_SECRET" from any scheduler.
 */
import "./load-env";
import { runJob, type Job } from "../src/lib/jobs";

const every: Record<Job, number> = {
  sync: Number(process.env.SYNC_INTERVAL_MIN || 5),
  sequences: Number(process.env.SEQUENCE_INTERVAL_MIN || 5),
  digests: 15,
  crm: Number(process.env.CRM_INTERVAL_MIN || 30),
  reminders: 15, backup: 60, billing: 30, prep: 10, trash: 1440, reports: 60, digest: 60, practice: 30, accounting: 60, fx: 720,
};
const last: Partial<Record<Job, number>> = {};
let stopping = false;
process.on("SIGTERM", () => { stopping = true; }); process.on("SIGINT", () => { stopping = true; });

// practice space: fresh sample data every night (09:00 UTC)
let practiceDay = "";
function practiceReset() {
  if (process.env.PRACTICE_MODE !== "true") return;
  const now = new Date(); const day = now.toISOString().slice(0, 10);
  if (now.getUTCHours() !== 9 || practiceDay === day) return;
  practiceDay = day;
  try { require("child_process").execFileSync(process.execPath, [require.resolve("tsx/cli"), "scripts/practice-reset.ts"], { stdio: "inherit" }); }
  catch (e) { console.error("practice reset failed", e); }
}
async function tick() {
  practiceReset();
  for (const job of Object.keys(every) as Job[]) {
    if (stopping) return;
    if (Date.now() - (last[job] || 0) < every[job] * 60_000) continue;
    last[job] = Date.now();
    try { const r = await runJob(job); console.log(new Date().toISOString(), job, JSON.stringify(r)); }
    catch (e) { console.error(new Date().toISOString(), job, "failed", e); }
  }
}
(async () => {
  console.log("Lead Tracker worker started");
  while (!stopping) { await tick(); await new Promise((r) => setTimeout(r, 30_000)); }
  console.log("Worker stopped"); process.exit(0);
})();
