import { db, schema } from "@/db";
import { syncMailbox, upgradePreviews } from "./mailsync";
import { runSequences } from "./sequencer";
import { runDigests } from "./digest";
import { autoPushCrm } from "./hubspot";
import { setState } from "./jobstate";
import { runReminders } from "./reminders";
import { weeklyBackup } from "./backup";
import { runBilling } from "./billingJob";
import { runMeetingPrep } from "./meetingPrep";
import { runTrashPurge } from "./trash";
import { runScheduledReports, runWeeklyDigest } from "./reportJobs";
import { runPracticeReset } from "./practice";
import { practiceMode } from "./config";
import { syncCalendarMeetings } from "./calendar";
import { syncQuickBooks } from "./qbo";
import { refreshFx } from "./fx";

export const JOBS = ["sync", "sequences", "digests", "crm", "reminders", "backup", "billing", "prep", "trash", "reports", "digest", "practice", "accounting", "fx"] as const;
export type Job = (typeof JOBS)[number];

export async function runJob(job: Job) {
  if (practiceMode() && ["sync", "crm", "backup"].includes(job)) return { skipped: "practice space" };
  const started = Date.now();
  let result: Record<string, unknown> = {};
  if (job === "sync") {
    const conns = await db.select().from(schema.connections);
    let logged = 0, errors = 0;
    let upgraded = 0;
    for (const c of conns) {
      try { logged += (await syncMailbox(c)).logged; } catch (e) { errors++; console.error("mail sync failed", c.email, e); continue; }
      try { await syncCalendarMeetings(c); } catch (e) { console.error("calendar sync failed", c.email, e); }
      try { upgraded += await upgradePreviews(c); } catch (e) { console.error("preview upgrade failed", c.email, e); }
    }
    result = { mailboxes: conns.length, logged, errors, upgraded };
  } else if (job === "sequences") result = await runSequences();
  else if (job === "digests") result = await runDigests();
  else if (job === "crm") result = await autoPushCrm();
  else if (job === "reminders") result = await runReminders();
  else if (job === "backup") result = await weeklyBackup();
  else if (job === "billing") result = await runBilling();
  else if (job === "prep") result = await runMeetingPrep();
  else if (job === "trash") result = await runTrashPurge();
  else if (job === "reports") result = await runScheduledReports();
  else if (job === "digest") result = await runWeeklyDigest();
  else if (job === "accounting") result = await syncQuickBooks();
  else if (job === "fx") result = await refreshFx();
  else if (job === "practice") result = await runPracticeReset();
  await setState(`job:${job}`, { ...result, ms: Date.now() - started, at: new Date().toISOString() });
  return result;
}
export async function runAll() {
  const out: Record<string, unknown> = {}; const { setState } = await import("./jobstate");
  for (const j of JOBS) { try { await setState(`lastrun:${j}`, { at: Date.now() }); out[j] = await runJob(j); } catch (e) { out[j] = { error: e instanceof Error ? e.message : String(e) }; } }
  return out;
}
