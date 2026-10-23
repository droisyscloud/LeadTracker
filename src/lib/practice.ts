import { spawn } from "child_process";
import path from "path";
/** The script runner, found at run time (not bundled into the web app). */
const tsxCli = () => path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
import { practiceMode } from "./config";
import { getState, setState } from "./jobstate";

/** Practice space: start the nightly refresh of sample data (09:00 UTC), once a day. */
export async function runPracticeReset(now = new Date()) {
  if (!practiceMode()) return { skipped: "not a practice space" };
  const day = now.toISOString().slice(0, 10);
  const st = (await getState("practiceNightly")) as { day?: string } | null;
  if (now.getUTCHours() !== 9 || st?.day === day) return { skipped: "not due" };
  await setState("practiceNightly", { day });
  const child = spawn(process.execPath, [tsxCli(), "scripts/practice-reset.ts"], { detached: true, stdio: "ignore", env: process.env });
  child.unref();
  return { started: true };
}
