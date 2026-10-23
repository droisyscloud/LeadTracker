import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor, requireCompany, requireContact, requireDeal, requireTask } from "@/lib/access";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
/** Groups of contacts that look like the same person: same email, or same name at the same company. */
export const GET = route(async () => {
  const me = await requireUser("manager");
  const acc = await accessFor(me);
  const everyone = (await db.select({ id: schema.contacts.id, name: schema.contacts.name, email: schema.contacts.email, companyId: schema.contacts.companyId, personal: schema.contacts.personal, createdById: schema.contacts.createdById }).from(schema.contacts)).filter((x) => !x.personal || x.createdById === me.id);
  const all = everyone.filter((c) => acc.canEditContact(c.id));
  const groups = new Map<string, string[]>();
  for (const c of all) {
    for (const k of [c.email ? `e:${c.email.toLowerCase()}` : null, `n:${norm(c.name)}:${c.companyId || ""}`]) {
      if (!k) continue; groups.set(k, [...(groups.get(k) || []), c.id]);
    }
  }
  const seen = new Set<string>(); const out: string[][] = [];
  for (const ids of groups.values()) { if (ids.length < 2) continue; const key = [...ids].sort().join(","); if (seen.has(key)) continue; seen.add(key); out.push(ids); }
  return ok({ groups: out });
});
