/**
 * PRACTICE SPACE ONLY. Wipes the practice data (keeping people, their settings and connections) and loads
 * fresh fictional sample data: teammates, leads, deals, tasks and activity.
 *   npm run practice:reset   (also runs every night in the practice space)
 */
import "./load-env";
import { execFileSync } from "child_process";
import { sql } from "drizzle-orm";
import { db } from "../src/db";

async function main() {
  if (process.env.PRACTICE_MODE !== "true") throw new Error("Refusing: this only runs in the practice space (PRACTICE_MODE=true).");
  const keep = new Set(["users", "job_state", "connections", "push_subscriptions", "invites", "__drizzle_migrations"]);
  const rows = (await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)) as unknown as { tablename: string }[];
  const wipe = rows.map((r) => r.tablename).filter((t) => !keep.has(t));
  if (wipe.length) await db.execute(sql.raw(`TRUNCATE ${wipe.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`));
  const run = (f: string) => execFileSync(process.execPath, [require.resolve("tsx/cli"), f], { stdio: "inherit", env: { ...process.env, ALLOW_DEMO: "true" } });
  run("scripts/seed.ts"); run("scripts/demo.ts");
  await db.execute(sql`INSERT INTO job_state (key, value) VALUES ('practice', ${JSON.stringify({ resetAt: Date.now() })}::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
  console.log(`Practice space reset: ${wipe.length} tables refreshed.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
