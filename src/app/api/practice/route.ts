import { spawn } from "child_process";
import path from "path";
/** The script runner, found at run time (not bundled into the web app). */
const tsxCli = () => path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { practiceMode } from "@/lib/config";

/** Practice space only: try the app as another role. */
export const PATCH = route(async (req: Request) => {
  if (!practiceMode()) throw new HttpError(404, "Not available.");
  const me = await requireUser("viewer");
  const d = await body(req, z.object({ role: z.enum(["admin", "manager", "rep", "viewer"]) }));
  await db.update(schema.users).set({ role: d.role }).where(eq(schema.users.id, me.id));
  // reps and viewers only see their own leads: give them a few sample leads so there's something to try
  let gave = 0;
  if (d.role === "rep" || d.role === "viewer") {
    const mine = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(eq(schema.contacts.ownerId, me.id)).limit(1);
    if (!mine.length) {
      const some = await db.select({ id: schema.contacts.id }).from(schema.contacts).orderBy(desc(schema.contacts.updatedAt)).limit(5);
      if (some.length) { await db.update(schema.contacts).set({ ownerId: me.id }).where(inArray(schema.contacts.id, some.map((x) => x.id))); gave = some.length; }
    }
  }
  return ok({ role: d.role, sampleLeads: gave });
});
/** Practice space only: start again with fresh sample data (takes a minute). */
export const POST = route(async () => {
  if (!practiceMode()) throw new HttpError(404, "Not available.");
  await requireUser("admin");
  const child = spawn(process.execPath, [tsxCli(), "scripts/practice-reset.ts"], { detached: true, stdio: "ignore", env: process.env });
  child.unref();
  return ok({ started: true });
});
