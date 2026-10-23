// Runs once when the server starts: keep email/calendar sync and other jobs going on their own (live site only).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production" || process.env.DISABLE_SCHEDULER === "1") return;
  if (process.env.NODE_ENV === "production" && process.env.FORCE_SCHEDULER !== "1" && process.env.TEST_MODE === "1") return;
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
