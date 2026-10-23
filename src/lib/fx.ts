import { getState, setState } from "./jobstate";

/**
 * Currency conversion. Rates are "units of a currency per 1 unit of the base currency", refreshed daily from the
 * European Central Bank (via frankfurter.app). Admins can override any rate by hand; overrides win.
 */
export type Fx = { base: string; rates: Record<string, number>; date: string | null; manual: Record<string, number>; source: "ecb" | "manual" | "none"; error?: string | null };
const API = () => (process.env.FX_API_BASE || "https://api.frankfurter.app").replace(/\/$/, "");
export async function getFx(): Promise<Fx> {
  const s = ((await getState("fx")) || {}) as Partial<Fx>; const base = (s.base || "USD").toUpperCase();
  const manual = s.manual || {}; const rates = { ...(s.rates || {}), ...manual, [base]: 1 };
  return { base, rates, date: s.date || null, manual, source: s.date ? "ecb" : Object.keys(manual).length ? "manual" : "none", error: s.error || null };
}
/** Fetch today's rates for the base currency (daily job, or "Refresh rates now"). */
export async function refreshFx() {
  const s = ((await getState("fx")) || {}) as Partial<Fx>; const base = (s.base || "USD").toUpperCase();
  try {
    const r = await fetch(`${API()}/latest?from=${encodeURIComponent(base)}`, { headers: { Accept: "application/json" } });
    const j = await r.json(); if (!r.ok || !j.rates) throw new Error(`Rates service said ${r.status}`);
    await setState("fx", { ...s, base, rates: j.rates as Record<string, number>, date: String(j.date || new Date().toISOString().slice(0, 10)), error: null });
    return { base, currencies: Object.keys(j.rates).length, date: j.date };
  } catch (e) { await setState("fx", { ...s, base, error: e instanceof Error ? e.message : "Couldn't fetch rates" }); return { base, error: e instanceof Error ? e.message : "failed" }; }
}
export async function saveFxSettings(d: { base?: string; manual?: Record<string, number> }) {
  const s = ((await getState("fx")) || {}) as Partial<Fx>; const base = (d.base || s.base || "USD").toUpperCase(); const changedBase = base !== (s.base || "USD").toUpperCase();
  await setState("fx", { ...s, base, manual: d.manual ?? s.manual ?? {}, ...(changedBase ? { rates: {}, date: null } : {}) });
  if (changedBase) await refreshFx();
}
/** An amount in the base currency (unknown currencies are left as they are, and reported by missingRates). */
export function toBase(amount: number, currency: string | null | undefined, fx: Pick<Fx, "base" | "rates">) {
  const c = (currency || fx.base).toUpperCase(); if (c === fx.base) return amount; const r = fx.rates[c]; return r ? amount / r : amount;
}
export const missingRates = (currencies: string[], fx: Pick<Fx, "base" | "rates">) => [...new Set(currencies.map((c) => (c || fx.base).toUpperCase()))].filter((c) => c !== fx.base && !fx.rates[c]);
