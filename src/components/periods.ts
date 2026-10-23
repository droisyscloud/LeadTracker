/**
 * Date periods for deals, based on each deal's close date (the date entered on the deal).
 * Ranges are inclusive YYYY-MM-DD strings in the browser's local time.
 */
export type PeriodKey = "all" | "this-month" | "last-month" | "this-quarter" | "last-quarter" | "this-year" | "ytd" | "last-year" | "ytd-last-year" | "custom";
export const PERIODS: [PeriodKey, string][] = [["all", "All time"], ["this-month", "This month"], ["last-month", "Last month"], ["this-quarter", "This quarter"],
  ["last-quarter", "Last quarter"], ["this-year", "This year"], ["ytd", "Year to date"], ["last-year", "Last year"], ["ytd-last-year", "Same period last year"], ["custom", "Custom range"]];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const end = (y: number, m: number) => iso(new Date(y, m + 1, 0));

export function periodRange(key: PeriodKey, custom?: { from: string; to: string }, now = new Date()): [string, string] | null {
  const y = now.getFullYear(), m = now.getMonth(), q = Math.floor(m / 3) * 3;
  switch (key) {
    case "this-month": return [iso(new Date(y, m, 1)), end(y, m)];
    case "last-month": return [iso(new Date(y, m - 1, 1)), end(y, m - 1)];
    case "this-quarter": return [iso(new Date(y, q, 1)), end(y, q + 2)];
    case "last-quarter": return [iso(new Date(y, q - 3, 1)), end(y, q - 1)];
    case "this-year": return [`${y}-01-01`, `${y}-12-31`];
    case "ytd": return [`${y}-01-01`, iso(now)];
    case "last-year": return [`${y - 1}-01-01`, `${y - 1}-12-31`];
    case "ytd-last-year": return [`${y - 1}-01-01`, iso(new Date(y - 1, m, Math.min(now.getDate(), new Date(y - 1, m + 1, 0).getDate())))];
    case "custom": return custom?.from && custom?.to ? [custom.from, custom.to] : null;
    default: return null;
  }
}
/** The same dates one year earlier (for "compared with last year"). */
export function lastYear(r: [string, string]): [string, string] {
  const shift = (s: string) => { const [yy, mm, dd] = s.split("-").map(Number); const last = new Date(yy - 1, mm, 0).getDate(); return `${yy - 1}-${pad(mm)}-${pad(Math.min(dd, last))}`; };
  return [shift(r[0]), shift(r[1])];
}
export const inRange = (d: string | null | undefined, r: [string, string] | null) => !r || (!!d && d >= r[0] && d <= r[1]);
export function rangeLabel(r: [string, string]) {
  const f = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  return `${f(r[0])} – ${f(r[1])}`;
}
/** Which month, quarter or year a date belongs to: a sortable key and a readable label. */
export function bucket(d: string, by: "month" | "quarter" | "year"): [string, string] {
  const [y, m] = d.split("-").map(Number);
  if (by === "year") return [`${y}`, `${y}`];
  if (by === "quarter") { const q = Math.floor((m - 1) / 3) + 1; return [`${y}-Q${q}`, `Q${q} ${y}`]; }
  return [`${y}-${pad(m)}`, new Date(y, m - 1, 1).toLocaleDateString([], { month: "short", year: "numeric" })];
}
