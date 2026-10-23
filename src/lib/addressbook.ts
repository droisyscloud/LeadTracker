import { accessToken, getConnection } from "./oauth";

export type BookPerson = { key: string; name: string; email: string; phone: string; company: string; title: string; source: "google" };
const PEOPLE = () => process.env.GOOGLE_PEOPLE_API_BASE || "https://people.googleapis.com";
export const hasContactsScope = (scope: string) => /contacts\.readonly/.test(scope);

type GP = { resourceName: string; names?: { displayName?: string }[]; emailAddresses?: { value?: string }[]; phoneNumbers?: { value?: string }[]; organizations?: { name?: string; title?: string }[] };
/** Your Google contacts (saved ones and "Other contacts": people you've emailed). Read-only; nothing is saved to the app. */
export async function googleContacts(userId: string): Promise<{ status: "ok" | "not_connected" | "reconnect"; people: BookPerson[] }> {
  const c = await getConnection(userId);
  if (!c || c.provider !== "google") return { status: "not_connected", people: [] };
  if (!hasContactsScope(c.scope)) return { status: "reconnect", people: [] };
  const tok = await accessToken(c); const out = new Map<string, BookPerson>();
  const take = (p: GP) => { const name = p.names?.[0]?.displayName?.trim() || ""; const email = (p.emailAddresses?.[0]?.value || "").trim().toLowerCase(); const phone = (p.phoneNumbers?.[0]?.value || "").trim();
    if (!name && !email) return; const key = email || `${name}|${phone}`; if (out.has(key)) return;
    out.set(key, { key: p.resourceName || key, name: name || email, email, phone, company: p.organizations?.[0]?.name || "", title: p.organizations?.[0]?.title || "", source: "google" }); };
  const page = async (path: string, field: "connections" | "otherContacts") => { let token = "";
    for (let i = 0; i < 10; i++) {
      const r = await fetch(`${PEOPLE()}${path}${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`, { headers: { authorization: `Bearer ${tok}` } });
      if (r.status === 403) { if (field === "connections") throw Object.assign(new Error("reconnect"), { reconnect: true }); return; }
      if (!r.ok) throw new Error(`Google contacts answered ${r.status}`);
      const j = await r.json() as { connections?: GP[]; otherContacts?: GP[]; nextPageToken?: string }; for (const p of j[field] || []) take(p);
      if (!j.nextPageToken) return; token = j.nextPageToken; } };
  try {
    await page("/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers,organizations&pageSize=1000&sortOrder=FIRST_NAME_ASCENDING", "connections");
    await page("/v1/otherContacts?readMask=names,emailAddresses,phoneNumbers&pageSize=1000", "otherContacts");
  } catch (e) { if ((e as { reconnect?: boolean }).reconnect) return { status: "reconnect", people: [] }; throw e; }
  return { status: "ok", people: [...out.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })) };
}
