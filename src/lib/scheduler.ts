import { JOBS, runJob, type Job } from "./jobs";
import { getState, setState } from "./jobstate";

/**
 * Background jobs run from inside the web service on their own timetable (mail and calendar sync every 5 minutes, etc.),
 * so nothing depends on a separate cron service existing. Each job records when it last ran; if the Render cron also
 * calls /api/cron, a job that ran recently is skipped, so they never double up.
 */
export const EVERY: Record<Job, number> = {
  sync: Number(process.env.SYNC_INTERVAL_MIN || 5), sequences: Number(process.env.SEQUENCE_INTERVAL_MIN || 5), digests: 15, crm: Number(process.env.CRM_INTERVAL_MIN || 30),
  reminders: 15, backup: 60, billing: 30, prep: 10, trash: 1440, reports: 60, digest: 60, practice: 30, accounting: 60, fx: 720,
};
let running = false;
export async function tick() {
  if (running) return; running = true;
  try {
    try { const { cleanupPastMeetingTasks, cleanupCcCopies } = await import("./cleanup"); await cleanupPastMeetingTasks(); await cleanupCcCopies(); } catch (e) { console.error("cleanup failed", e); }
    for (const j of JOBS) {
      const st = ((await getState(`lastrun:${j}`)) || {}) as { at?: number };
      if (st.at && Date.now() - st.at < (EVERY[j] ?? 15) * 60_000 * 0.9) continue;
      await setState(`lastrun:${j}`, { at: Date.now() });
      try { await runJob(j); } catch (e) { console.error(`job ${j} failed`, e); }
    }
  } finally { running = false; }
}
export function startScheduler() {
  const g = globalThis as unknown as { __ltScheduler?: boolean }; if (g.__ltScheduler) return; g.__ltScheduler = true;
  setTimeout(() => { tick().catch(() => undefined); setInterval(() => tick().catch(() => undefined), 60_000); }, 30_000);   // start a little after boot
  console.log("Scheduler on: mail and calendar sync every", EVERY.sync, "minutes");
}
