import { randomBytes } from "crypto";

/** Short-lived private links for showing a file in Microsoft's Office viewer (PowerPoint). Kept in memory, 10 minutes. */
type Item = { buf: Buffer; type: string; name: string; exp: number };
const g = globalThis as unknown as { __previewLinks?: Map<string, Item> };
const store = (g.__previewLinks ??= new Map());
const MAX = 200 * 1024 * 1024;
export function addPreview(buf: Buffer, type: string, name: string): string {
  const now = Date.now(); for (const [k, v] of store) if (v.exp < now) store.delete(k);
  let total = [...store.values()].reduce((n, v) => n + v.buf.length, 0);
  for (const [k, v] of store) { if (total + buf.length <= MAX) break; store.delete(k); total -= v.buf.length; }
  const token = randomBytes(24).toString("base64url"); store.set(token, { buf, type, name, exp: now + 10 * 60_000 }); return token;
}
export function getPreview(token: string): Item | null { const v = store.get(token); if (!v || v.exp < Date.now()) { store.delete(token); return null; } return v; }
