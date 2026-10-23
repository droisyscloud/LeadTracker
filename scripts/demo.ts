/**
 * DEMO DATA ONLY. Fills a test copy with fictional teammates, companies, leads, deals, tasks and two weeks
 * of activity so you can see the dashboards working. Every person and company here is made up, and every
 * email address uses the reserved ".example" domain, so nothing can ever be sent to a real person.
 * Do not run this on your live database.   npm run db:demo
 */
import "./load-env";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { companyKey } from "../src/lib/normalize";

const DAY = 86400_000; const now = Date.now();
const pick = <T,>(a: T[], i: number) => a[i % a.length];

const PRODUCTS: [string, string][] = [["Starter plan", "Our entry package for small teams"], ["Enterprise plan", "Full platform with onboarding and support"]];
const COMPANIES: [string, string][] = [["Acme Logistics", "acme.example"], ["Bluepeak Clinics", "bluepeak.example"], ["Cedarline Retail", "cedarline.example"],
  ["Driftwood Hotels", "driftwood.example"], ["Everfield Foods", "everfield.example"], ["Fjordbyte Software", "fjordbyte.example"],
  ["Larkspur Manufacturing", "larkspur.example"], ["Northwind Traders", "northwind.example"]];
// name, title, company, product (0 = Starter, 1 = Enterprise)
const LEADS: [string, string, string, number][] = [
  ["Jordan Avery", "Operations Director", "Acme Logistics", 1], ["Casey Brooks", "CFO", "Acme Logistics", 1],
  ["Morgan Lee", "Practice Manager", "Bluepeak Clinics", 0], ["Riley Chen", "IT Lead", "Bluepeak Clinics", 0],
  ["Taylor Diaz", "Head of Stores", "Cedarline Retail", 1], ["Jamie Fox", "Procurement Manager", "Cedarline Retail", 1],
  ["Avery Grant", "General Manager", "Driftwood Hotels", 1], ["Quinn Harper", "Revenue Manager", "Driftwood Hotels", 0],
  ["Drew Ingram", "Supply Chain Lead", "Everfield Foods", 0], ["Sam Jensen", "CTO", "Fjordbyte Software", 1],
  ["Robin Kaur", "VP Engineering", "Fjordbyte Software", 1], ["Alex Novak", "Plant Manager", "Larkspur Manufacturing", 0],
  ["Charlie Ortiz", "Purchasing Director", "Larkspur Manufacturing", 1], ["Hayden Park", "Owner", "Northwind Traders", 0],
];

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO !== "true") throw new Error("Refusing to load demo data in production.");
  // teammates
  const people = [["admin@demo.example", "Alex Morgan", "admin"], ["priya@demo.example", "Priya Rao", "manager"], ["marcus@demo.example", "Marcus Lee", "rep"],
    ["sara@demo.example", "Sara Kim", "rep"], ["dev@demo.example", "Dev Patel", "rep"]] as const;
  const users: Record<string, string> = {};
  for (const [email, name, role] of people) {
    const [u] = await db.insert(schema.users).values({ email, name, role, lastLoginAt: new Date(now - DAY) }).onConflictDoUpdate({ target: schema.users.email, set: { name } }).returning();
    users[name] = u.id;
  }
  // products
  const prod: string[] = [];
  for (const [name, description] of PRODUCTS) {
    await db.insert(schema.products).values({ name, description }).onConflictDoNothing();
    const [p] = await db.select().from(schema.products).where(eq(schema.products.name, name)).limit(1); prod.push(p.id);
  }
  // teams
  const mk = async (name: string, description: string, color: string, lead: string, members: string[], products: string[], target: number) => {
    const [t] = await db.insert(schema.teams).values({ name, description, color, leadId: users[lead], target }).onConflictDoUpdate({ target: schema.teams.name, set: { description } }).returning();
    await db.delete(schema.teamMembers).where(eq(schema.teamMembers.teamId, t.id)); await db.delete(schema.teamProducts).where(eq(schema.teamProducts.teamId, t.id));
    await db.insert(schema.teamMembers).values(members.map((n) => ({ teamId: t.id, userId: users[n] })));
    await db.insert(schema.teamProducts).values(products.map((productId) => ({ teamId: t.id, productId })));
    return t.id;
  };
  const ent = await mk("Enterprise accounts", "Larger customers buying the full platform", "#38D6E8", "Priya Rao", ["Priya Rao", "Marcus Lee", "Dev Patel"], [prod[1]], 600000);
  const smb = await mk("Small business", "Smaller teams on the starter plan", "#9B8CFF", "Sara Kim", ["Sara Kim", "Alex Morgan"], [prod[0]], 250000);
  // event
  let [ev] = await db.select().from(schema.events).where(eq(schema.events.name, "Spring Expo 2026")).limit(1);
  if (!ev) [ev] = await db.insert(schema.events).values({ name: "Spring Expo 2026", location: "Austin, TX" }).returning();
  await db.update(schema.events).set({ cost: 25000, startDate: "2026-10-06", endDate: "2026-10-08" }).where(eq(schema.events.id, ev.id));
  // companies and leads
  const co = new Map<string, string>();
  for (const [name, website] of COMPANIES) {
    const key = companyKey(name);
    const [row] = await db.insert(schema.companies).values({ name, nameKey: key, website }).onConflictDoUpdate({ target: schema.companies.nameKey, set: { nameKey: key } }).returning();
    co.set(name, row.id);
  }
  const repsEnt = ["Marcus Lee", "Dev Patel", "Priya Rao"], repsSmb = ["Sara Kim", "Alex Morgan"];
  let i = 0;
  for (const [name, title, company, p] of LEADS) {
    const email = `${name.split(" ")[0].toLowerCase()}@${COMPANIES.find((c) => c[0] === company)![1]}`;
    const [dup] = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(eq(schema.contacts.email, email)).limit(1);
    if (dup) { i++; continue; }
    const big = p === 1; const owner = users[pick(big ? repsEnt : repsSmb, i)];
    const status = pick(["contacted", "engaged", "meeting", "new", "contacted", "proposal", "engaged"], i) as "new" | "contacted" | "engaged" | "meeting" | "proposal";
    const [c] = await db.insert(schema.contacts).values({ name, title, email, phone: "", companyId: co.get(company)!, source: "Booth", eventId: ev.id, teamId: big ? ent : smb,
      ownerId: owner, status, rating: (i % 5) + 1, lastTouchAt: new Date(now - (i % 9) * DAY) }).returning();
    await db.insert(schema.contactProducts).values({ contactId: c.id, productId: prod[p] }).onConflictDoNothing();
    if (status !== "new") for (let k = 0; k < 2 + (i % 3); k++) {
      const type = pick(["email", "call", "email", "reply", "meeting"], i + k) as "email" | "call" | "reply" | "meeting";
      await db.insert(schema.activities).values({ contactId: c.id, type, byId: owner, at: new Date(now - ((i + k * 3) % 13) * DAY - k * 3600_000),
        subject: type === "email" ? "Following up from Spring Expo" : "", body: type === "reply" ? "Thanks, happy to talk next week." : type === "call" ? "Talked through their current setup and timeline." : "",
        outcome: type === "call" ? pick(["connected", "voicemail"], i) : null, delivery: type === "email" ? "sent" : null, openedAt: type === "email" && i % 2 ? new Date(now - DAY) : null, openCount: type === "email" && i % 2 ? 2 : 0 });
    }
    i++;
  }
  // deals
  const deals: [string, string, number, number, string, "qualify" | "proposal" | "negotiation" | "won" | "lost", string][] = [
    ["Acme fleet rollout", "Acme Logistics", 180000, 1, "Marcus Lee", "negotiation", "2026-11-28"], ["Cedarline all-stores", "Cedarline Retail", 140000, 1, "Dev Patel", "proposal", "2026-12-12"],
    ["Fjordbyte platform", "Fjordbyte Software", 95000, 1, "Priya Rao", "won", "2026-09-30"], ["Larkspur plant pilot", "Larkspur Manufacturing", 60000, 1, "Marcus Lee", "qualify", "2027-01-20"],
    ["Driftwood starter", "Driftwood Hotels", 24000, 0, "Sara Kim", "proposal", "2026-12-05"], ["Bluepeak clinics", "Bluepeak Clinics", 18000, 0, "Sara Kim", "negotiation", "2026-11-15"],
    ["Northwind starter", "Northwind Traders", 9000, 0, "Alex Morgan", "won", "2026-09-20"], ["Everfield pilot", "Everfield Foods", 12000, 0, "Alex Morgan", "lost", "2026-09-10"],
  ];
  for (const [name, company, value, p, owner, stage, closeDate] of deals) {
    const [exists] = await db.select({ id: schema.deals.id }).from(schema.deals).where(eq(schema.deals.name, name)).limit(1); if (exists) continue;
    const prob = { qualify: 20, proposal: 50, negotiation: 75, won: 100, lost: 0 }[stage];
    await db.insert(schema.deals).values({ name, companyId: co.get(company) ?? null, productId: prod[p], value, stage, probability: prob, closeDate, ownerId: users[owner], teamId: p ? ent : smb,
      closedAt: stage === "won" || stage === "lost" ? new Date(now - 10 * DAY) : null, outcomeReason: stage === "won" ? "Product fit" : stage === "lost" ? "Timing" : null });
  }
  // tasks
  const tasks: [string, number, string][] = [["Send proposal to Acme", -1, "Marcus Lee"], ["Book demo with Cedarline store leads", 0, "Dev Patel"], ["Prepare pricing for Driftwood", 2, "Sara Kim"],
    ["Security questionnaire for Bluepeak", 5, "Sara Kim"], ["Follow up Fjordbyte on phase 2", 7, "Priya Rao"], ["Share onboarding plan with Northwind", 1, "Alex Morgan"]];
  for (const [title, d, who] of tasks) {
    const [exists] = await db.select({ id: schema.tasks.id }).from(schema.tasks).where(eq(schema.tasks.title, title)).limit(1); if (exists) continue;
    await db.insert(schema.tasks).values({ title, dueDate: new Date(now + d * DAY).toISOString().slice(0, 10), assigneeId: users[who], createdById: users[who] });
  }
  console.log(`Demo data loaded: 5 teammates, 2 teams, ${COMPANIES.length} companies, ${LEADS.length} leads, ${deals.length} deals, ${tasks.length} tasks. All fictional.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
