import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decrypt, encrypt } from "./crypto";

export const MS_SCOPES = "openid email profile offline_access User.Read Mail.Read Mail.Send Calendars.ReadWrite";
export const GOOGLE_SCOPES = "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/contacts.other.readonly";

export type Conn = typeof schema.connections.$inferSelect;

export async function saveConnection(userId: string, provider: "microsoft" | "google", email: string, t: { access_token?: string; refresh_token?: string; expires_at?: number; scope?: string }) {
  if (!t.access_token) return;
  const [old] = await db.select().from(schema.connections).where(eq(schema.connections.userId, userId)).limit(1);
  const row = {
    userId, provider, email, accessToken: encrypt(t.access_token),
    refreshToken: t.refresh_token ? encrypt(t.refresh_token) : old?.refreshToken ?? null,
    expiresAt: t.expires_at ? new Date(t.expires_at * 1000) : null, scope: t.scope || "", status: "ok" as const, lastError: null,
  };
  await db.insert(schema.connections).values(row).onConflictDoUpdate({ target: schema.connections.userId, set: row });
}

async function refresh(c: Conn): Promise<string> {
  if (!c.refreshToken) throw new Error("No refresh token. Reconnect the mailbox.");
  const isMs = c.provider === "microsoft";
  const url = isMs ? `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID || "common"}/oauth2/v2.0/token` : (process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token");
  const body = new URLSearchParams({
    grant_type: "refresh_token", refresh_token: decrypt(c.refreshToken),
    client_id: (isMs ? process.env.AUTH_MICROSOFT_ENTRA_ID_ID : process.env.AUTH_GOOGLE_ID) || "",
    client_secret: (isMs ? process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET : process.env.AUTH_GOOGLE_SECRET) || "",
    ...(isMs ? { scope: MS_SCOPES } : {}),
  });
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(15000) });
  const j = (await r.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
  if (!r.ok || !j.access_token) throw new Error(j.error_description || `Token refresh failed (${r.status})`);
  await db.update(schema.connections).set({
    accessToken: encrypt(j.access_token), refreshToken: j.refresh_token ? encrypt(j.refresh_token) : c.refreshToken,
    expiresAt: new Date(Date.now() + (j.expires_in || 3600) * 1000), status: "ok", lastError: null,
  }).where(eq(schema.connections.userId, c.userId));
  return j.access_token;
}

export async function accessToken(c: Conn): Promise<string> {
  if (c.expiresAt && c.expiresAt.getTime() - Date.now() > 120_000) return decrypt(c.accessToken);
  return refresh(c);
}

export async function getConnection(userId: string) {
  const [c] = await db.select().from(schema.connections).where(eq(schema.connections.userId, userId)).limit(1);
  return c ?? null;
}

/** Authorized JSON fetch against Microsoft Graph or Google APIs. */
/** Google or Microsoft asked us to slow down. The sync stops quietly and picks up on the next run. */
export class RateLimitError extends Error { constructor(public provider: string) { super(`${provider} rate limit`); } }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isRateLimit = (status: number, txt: string) => status === 429 || (status === 403 && /rateLimitExceeded|userRateLimitExceeded|Quota exceeded|RESOURCE_EXHAUSTED/i.test(txt));

export async function apiFetch<T>(c: Conn, url: string, init: RequestInit = {}): Promise<T> {
  const tok = await accessToken(c);
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", ...(init.headers || {}) }, signal: AbortSignal.timeout(20000) });
    if (r.ok) return (r.status === 204 ? null : await r.json()) as T;
    const txt = await r.text();
    if (isRateLimit(r.status, txt)) {
      if (attempt >= 2) throw new RateLimitError(c.provider);
      const after = Number(r.headers.get("retry-after"));
      await sleep(Math.min(20_000, (Number.isFinite(after) && after > 0 ? after * 1000 : 2000 * 2 ** attempt)));
      continue;
    }
    throw new Error(`${c.provider} API ${r.status}: ${txt.slice(0, 300)}`);
  }
}

/** Whether this connection was granted permission to send mail as the person. */
/** drive.file only lets the app see files it created itself (the backups), nothing else in Drive. */
export const canBackup = (c: Pick<Conn, "provider" | "scope">) => c.provider === "google" && /drive\.file/.test(c.scope);
export const canSendMail = (c: Pick<Conn, "provider" | "scope">) => c.provider === "google" ? /gmail\.send/.test(c.scope) : /Mail\.Send/i.test(c.scope);
