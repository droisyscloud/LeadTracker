import { ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";

/**
 * Street address suggestions (house number, street, city, state, ZIP, country) for address forms, from
 * OpenStreetMap (Photon, with Nominatim as a backup). Free and keyless; cached for a day.
 */
type Addr = { label: string; address1: string; city: string; state: string; zip: string; country: string };
const cache = new Map<string, { at: number; list: Addr[] }>();
const PHOTON = () => process.env.GEO_API_BASE || "https://photon.komoot.io";
const NOMINATIM = () => process.env.GEO_FALLBACK_BASE || "https://nominatim.openstreetmap.org";
const UA = `LeadTracker/1.0 (${process.env.MAIL_FROM_ADDRESS || process.env.COMPANY_EMAIL || "self-hosted"})`;
const tidy = (parts: (string | undefined)[]) => [...new Set(parts.map((x) => (x || "").trim()).filter(Boolean))].join(", ");
const line1 = (num?: string, street?: string, name?: string) => (street ? tidy([[num, street].filter(Boolean).join(" ")]) : name || "");

async function photon(q: string): Promise<Addr[]> {
  const r = await fetch(`${PHOTON()}/api/?q=${encodeURIComponent(q)}&limit=6&lang=en`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`photon ${r.status}`);
  const j = await r.json() as { features?: { properties: Record<string, string> }[] };
  return (j.features || []).map(({ properties: p }) => { const a1 = line1(p.housenumber, p.street, p.name); const city = p.city || p.town || p.village || p.district || "";
    return { address1: a1, city, state: p.state || "", zip: p.postcode || "", country: p.country || "", label: tidy([a1, city, p.state, p.postcode, p.country]) }; });
}
async function nominatim(q: string): Promise<Addr[]> {
  const r = await fetch(`${NOMINATIM()}/search?q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1&limit=6&accept-language=en`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`nominatim ${r.status}`);
  const j = await r.json() as { name?: string; address?: Record<string, string> }[];
  return j.map((x) => { const a = x.address || {}; const a1 = line1(a.house_number, a.road, x.name); const city = a.city || a.town || a.village || a.municipality || "";
    return { address1: a1, city, state: a.state || a.region || "", zip: a.postcode || "", country: a.country || "", label: tidy([a1, city, a.state, a.postcode, a.country]) }; });
}
export const GET = route(async (req: Request) => {
  await requireUser("viewer");
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 160);
  if (q.length < 3) return ok({ list: [] });
  const k = q.toLowerCase(); const hit = cache.get(k); if (hit && Date.now() - hit.at < 86400_000) return ok({ list: hit.list });
  let list: Addr[] = [];
  try { list = await photon(q); } catch { try { list = await nominatim(q); } catch { list = []; } }
  list = list.filter((x) => x.label).filter((x, i, all) => all.findIndex((y) => y.label === x.label) === i);
  cache.set(k, { at: Date.now(), list }); if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  return ok({ list });
});
