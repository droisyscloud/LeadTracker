import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";

/**
 * Place suggestions from around the world for location fields, from OpenStreetMap (Photon, with Nominatim
 * as a backup). Free and keyless; answers are cached for a day, and each person is limited to a sensible rate.
 */
type Place = { label: string; city: string; region: string; country: string };
const cache = new Map<string, { at: number; places: Place[] }>();
const hits = new Map<string, number[]>();
const PHOTON = () => process.env.GEO_API_BASE || "https://photon.komoot.io";
const NOMINATIM = () => process.env.GEO_FALLBACK_BASE || "https://nominatim.openstreetmap.org";
const UA = `LeadTracker/1.0 (${process.env.MAIL_FROM_ADDRESS || process.env.COMPANY_EMAIL || "self-hosted"})`;
const tidy = (parts: (string | undefined)[]) => [...new Set(parts.map((x) => (x || "").trim()).filter(Boolean))].join(", ");

async function photon(q: string): Promise<Place[]> {
  const r = await fetch(`${PHOTON()}/api/?q=${encodeURIComponent(q)}&limit=8&lang=en`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`photon ${r.status}`);
  const j = await r.json() as { features?: { properties: Record<string, string> }[] };
  return (j.features || []).map(({ properties: p }) => {
    const city = p.type === "city" || p.osm_value === "city" || p.osm_value === "town" || p.osm_value === "village" ? p.name : p.city || p.name;
    return { city, region: p.state || p.county || "", country: p.country || "", label: tidy([city, p.state || p.county, p.country]) };
  });
}
async function nominatim(q: string): Promise<Place[]> {
  const r = await fetch(`${NOMINATIM()}/search?format=jsonv2&addressdetails=1&limit=8&accept-language=en&q=${encodeURIComponent(q)}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`nominatim ${r.status}`);
  const j = await r.json() as { name?: string; address?: Record<string, string> }[];
  return j.map((x) => { const a = x.address || {}; const city = a.city || a.town || a.village || a.municipality || x.name || "";
    return { city, region: a.state || a.region || a.county || "", country: a.country || "", label: tidy([city, a.state || a.region || a.county, a.country]) }; });
}

export const GET = route(async (req: Request) => {
  const me = await requireUser("viewer");
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 120);
  if (q.length < 2) return ok({ places: [] });
  const now = Date.now(); const recent = (hits.get(me.id) || []).filter((t) => now - t < 60_000);
  if (recent.length > 60) throw new HttpError(429, "Too many searches. Wait a moment.");
  hits.set(me.id, [...recent, now]);
  const key = q.toLowerCase(); const c = cache.get(key);
  if (c && now - c.at < 86400_000) return ok({ places: c.places });
  let places: Place[] = [];
  try { places = await photon(q); } catch { try { places = await nominatim(q); } catch (e) { console.error("place search failed", e); return ok({ places: [], unavailable: true }); } }
  const seen = new Set<string>(); places = places.filter((p) => p.label && !seen.has(p.label) && seen.add(p.label)).slice(0, 6);
  if (cache.size > 2000) cache.clear();
  cache.set(key, { at: now, places });
  return ok({ places });
});
