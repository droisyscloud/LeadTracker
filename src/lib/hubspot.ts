import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { practiceMode } from "./config";

const TOKEN = () => process.env.HUBSPOT_TOKEN;
export const crmConfigured = () => !!TOKEN();
async function hs<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`https://api.hubapi.com${path}`, { ...init, headers: { Authorization: `Bearer ${TOKEN()}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HubSpot ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return (r.status === 204 ? null : await r.json()) as T;
}

/** Creates or updates the contact and its company in HubSpot and links them. Returns the HubSpot contact id. */
export async function pushToHubspot(contactId: string): Promise<string> {
  if (practiceMode()) { console.log("[practice] not sent: pushToHubspot"); return "practice"; }
  if (!crmConfigured()) throw new Error("HubSpot is not configured. Set HUBSPOT_TOKEN.");
  const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, contactId)).limit(1); if (c?.personal) return null as never;   // personal contacts never go to the CRM
  if (!c) throw new Error("Contact not found");
  const [co] = c.companyId ? await db.select().from(schema.companies).where(eq(schema.companies.id, c.companyId)).limit(1) : [];
  const [first, ...rest] = c.name.split(/\s+/);
  const props: Record<string, string> = { firstname: first || "", lastname: rest.join(" "), jobtitle: c.title, phone: c.phone, company: co?.name || "" };
  let hsId = c.crmId;
  if (!hsId && c.email) {
    const r = await hs<{ results: { id: string }[] }>("/crm/v3/objects/contacts/batch/upsert", { method: "POST", body: JSON.stringify({ inputs: [{ idProperty: "email", id: c.email, properties: { ...props, email: c.email } }] }) });
    hsId = r.results[0]?.id || null;
  } else if (hsId) {
    await hs(`/crm/v3/objects/contacts/${hsId}`, { method: "PATCH", body: JSON.stringify({ properties: props }) });
  } else {
    const r = await hs<{ id: string }>("/crm/v3/objects/contacts", { method: "POST", body: JSON.stringify({ properties: props }) });
    hsId = r.id;
  }
  if (!hsId) throw new Error("HubSpot did not return a contact id");
  if (co) {
    let coId = co.crmId;
    if (!coId && co.website) {
      const s = await hs<{ results: { id: string }[] }>("/crm/v3/objects/companies/search", { method: "POST", body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: "domain", operator: "EQ", value: co.website }] }], limit: 1 }) });
      coId = s.results[0]?.id || null;
    }
    if (!coId) coId = (await hs<{ id: string }>("/crm/v3/objects/companies", { method: "POST", body: JSON.stringify({ properties: { name: co.name, domain: co.website, industry: "", description: co.description } }) })).id;
    await db.update(schema.companies).set({ crmId: coId }).where(eq(schema.companies.id, co.id));
    await hs(`/crm/v4/objects/contact/${hsId}/associations/default/company/${coId}`, { method: "PUT" });
  }
  await db.update(schema.contacts).set({ crmId: hsId, crmSyncedAt: new Date() }).where(eq(schema.contacts.id, contactId));
  return hsId;
}

const RANK: Record<string, number> = { new: 0, contacted: 1, engaged: 2, meeting: 3, proposal: 4, won: 5, lost: -1 };
/** Pushes every lead at or beyond CRM_AUTO_PUSH_STAGE that has not been synced yet (or changed since). */
export async function autoPushCrm(): Promise<{ pushed: number }> {
  const stage = process.env.CRM_AUTO_PUSH_STAGE;
  if (!crmConfigured() || !stage) return { pushed: 0 };
  const all = (await db.select().from(schema.contacts)).filter((x) => !x.personal);   // personal contacts never go to the CRM
  let pushed = 0;
  for (const c of all) {
    if (RANK[c.status] < RANK[stage]) continue;
    if (c.crmSyncedAt && c.crmSyncedAt >= c.updatedAt) continue;
    try { await pushToHubspot(c.id); pushed++; } catch (e) { console.error("hubspot push failed", c.id, e); }
  }
  return { pushed };
}
