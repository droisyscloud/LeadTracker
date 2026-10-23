import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decrypt, encrypt } from "./crypto";
import { HttpError } from "./http";
import { ingest, type ExtInvoice } from "./accounting";

/** QuickBooks Online: connect (OAuth), keep tokens fresh, pull invoices and payments so billing items are marked invoiced and paid by themselves. */
const AUTH = () => process.env.QBO_AUTH_URL || "https://appcenter.intuit.com/connect/oauth2";
const TOKEN = () => process.env.QBO_TOKEN_URL || "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const API = () => process.env.QBO_API_BASE || (process.env.QBO_ENV === "production" ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com");
const appUrl = () => (process.env.APP_URL || process.env.AUTH_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/$/, "");
export const qboConfigured = () => !!(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET);
export const qboRedirect = () => `${appUrl()}/api/integrations/quickbooks/callback`;
const basic = () => "Basic " + Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString("base64");

export function authorizeUrl() {
  const state = randomBytes(18).toString("base64url");
  const u = new URL(AUTH()); u.searchParams.set("client_id", process.env.QBO_CLIENT_ID || ""); u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "com.intuit.quickbooks.accounting"); u.searchParams.set("redirect_uri", qboRedirect()); u.searchParams.set("state", state);
  return { url: u.toString(), state };
}
async function tokenCall(params: Record<string, string>) {
  const r = await fetch(TOKEN(), { method: "POST", headers: { Authorization: basic(), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams(params) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new HttpError(502, `QuickBooks refused the sign-in (${j.error || r.status}). Try connecting again.`);
  return j as { access_token: string; refresh_token: string; expires_in: number };
}
export async function finishConnect(code: string, realmId: string, userId: string) {
  const t = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: qboRedirect() });
  const row = { provider: "quickbooks" as const, realmId, accessToken: encrypt(t.access_token), refreshToken: encrypt(t.refresh_token), expiresAt: new Date(Date.now() + (t.expires_in - 120) * 1000), status: "ok" as const, lastError: null, connectedById: userId };
  await db.insert(schema.accountingConnections).values(row).onConflictDoUpdate({ target: schema.accountingConnections.provider, set: row });
  const info = await qbo<{ CompanyInfo?: { CompanyName?: string } }>(`/companyinfo/${realmId}`).catch(() => null);
  if (info?.CompanyInfo?.CompanyName) await db.update(schema.accountingConnections).set({ companyName: info.CompanyInfo.CompanyName }).where(eq(schema.accountingConnections.provider, "quickbooks"));
}
async function conn() {
  const [c] = await db.select().from(schema.accountingConnections).where(eq(schema.accountingConnections.provider, "quickbooks")).limit(1);
  if (!c) throw new HttpError(400, "QuickBooks isn't connected. An admin can connect it in Settings.");
  if (c.expiresAt.getTime() > Date.now()) return { c, token: decrypt(c.accessToken) };
  try {
    const t = await tokenCall({ grant_type: "refresh_token", refresh_token: decrypt(c.refreshToken) });
    await db.update(schema.accountingConnections).set({ accessToken: encrypt(t.access_token), refreshToken: encrypt(t.refresh_token), expiresAt: new Date(Date.now() + (t.expires_in - 120) * 1000), status: "ok", lastError: null }).where(eq(schema.accountingConnections.provider, "quickbooks"));
    return { c, token: t.access_token };
  } catch (e) { await db.update(schema.accountingConnections).set({ status: "error", lastError: "The QuickBooks sign-in expired. Reconnect it in Settings." }).where(eq(schema.accountingConnections.provider, "quickbooks")); throw e; }
}
async function qbo<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const { c, token } = await conn();
  const r = await fetch(`${API()}/v3/company/${c.realmId}${path}${path.includes("?") ? "&" : "?"}minorversion=73`, { method: init?.method || "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) }, body: init?.body ? JSON.stringify(init.body) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new HttpError(502, `QuickBooks: ${j?.Fault?.Error?.[0]?.Detail || j?.Fault?.Error?.[0]?.Message || r.status}`);
  return j as T;
}
const query = async <T>(q: string) => (await qbo<{ QueryResponse: Record<string, T[]> }>(`/query?query=${encodeURIComponent(q)}`)).QueryResponse || {};

type QInv = { Id: string; DocNumber?: string; CustomerRef?: { name?: string }; TotalAmt: number; Balance: number; TxnDate?: string; DueDate?: string; CurrencyRef?: { value?: string } };
type QPay = { Id: string; TxnDate: string; Line?: { LinkedTxn?: { TxnId: string; TxnType: string }[] }[] };
/** Pull invoices and payments changed since the last sync, and update the app. */
export async function syncQuickBooks() {
  const [c] = await db.select().from(schema.accountingConnections).where(eq(schema.accountingConnections.provider, "quickbooks")).limit(1); if (!c) return { skipped: "not connected" };
  const since = (c.lastSyncAt ? new Date(c.lastSyncAt.getTime() - 3600_000) : new Date(Date.now() - 400 * 86400_000)).toISOString();
  try {
    const inv = ((await query<QInv>(`select * from Invoice where MetaData.LastUpdatedTime > '${since}' maxresults 1000`)).Invoice || []) as QInv[];
    const pays = ((await query<QPay>(`select * from Payment where MetaData.LastUpdatedTime > '${since}' maxresults 1000`)).Payment || []) as QPay[];
    const paidOn = new Map<string, string>(); for (const p of pays) for (const l of p.Line || []) for (const t of l.LinkedTxn || []) if (t.TxnType === "Invoice" && (!paidOn.get(t.TxnId) || paidOn.get(t.TxnId)! < p.TxnDate)) paidOn.set(t.TxnId, p.TxnDate);
    const list: ExtInvoice[] = inv.map((i) => ({ source: "quickbooks", externalId: i.Id, docNumber: i.DocNumber || "", customerName: i.CustomerRef?.name || "", amount: Number(i.TotalAmt) || 0, balance: Number(i.Balance) || 0,
      currency: i.CurrencyRef?.value || "USD", txnDate: i.TxnDate || null, dueDate: i.DueDate || null, paidOn: Number(i.Balance) <= 0 ? paidOn.get(i.Id) || null : null }));
    const r = await ingest(list);
    await db.update(schema.accountingConnections).set({ lastSyncAt: new Date(), status: "ok", lastError: null }).where(eq(schema.accountingConnections.provider, "quickbooks"));
    return r;
  } catch (e) { await db.update(schema.accountingConnections).set({ status: "error", lastError: e instanceof Error ? e.message : "Sync failed" }).where(eq(schema.accountingConnections.provider, "quickbooks")); throw e; }
}
const esc = (s: string) => s.replace(/'/g, "\\'");
