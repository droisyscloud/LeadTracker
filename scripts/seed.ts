/**
 * First-run setup: a ready-made 3-email follow-up sequence, so there is something to start from.
 * No people, companies or products are added: you bring your own (or run `npm run db:demo` on a test copy).
 * Safe to run more than once.
 */
import "./load-env";
import { db, schema } from "../src/db";

async function main() {
  const [seq] = await db.select().from(schema.sequences).limit(1);
  if (!seq) await db.insert(schema.sequences).values({ name: "Event follow-up (3 emails)", steps: [
    { dayOffset: 0, subject: "Great meeting you, {first}", body: "Hi {first},\n\nThank you for stopping by our booth. It was great to hear what {company} is working on.\n\nWould you have 30 minutes next week for a short call?\n\nBest regards,\n{me}\n{mycompany}" },
    { dayOffset: 4, subject: "Quick follow-up, {first}", body: "Hi {first},\n\nFollowing up on my earlier note. Is this still a priority for {company} this quarter? Happy to send a short summary instead of a call.\n\nBest regards,\n{me}\n{mycompany}" },
    { dayOffset: 10, subject: "Should I close the loop?", body: "Hi {first},\n\nI don't want to crowd your inbox. If the timing isn't right, just let me know and I'll check back later in the year.\n\nBest regards,\n{me}\n{mycompany}" },
  ] });
  console.log("Setup complete: starter email sequence ready.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
