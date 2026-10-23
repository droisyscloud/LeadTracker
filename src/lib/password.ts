import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { appUrl } from "./config";

/**
 * Email and password sign-in, for companies without Google Workspace or Microsoft 365 admin access.
 * Switched on with AUTH_EMAIL_PASSWORD=true. Passwords are stored only as scrypt hashes, in their own table.
 */
const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const N = 16384, R = 8, P = 1, LEN = 64;

export const passwordEnabled = () => process.env.AUTH_EMAIL_PASSWORD === "true";
export const MIN_PASSWORD = 10;

/** Problems with a new password, in plain words, or null when it's fine. */
export function passwordProblem(pw: string, email?: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (pw.length > 200) return "That password is too long.";
  if (email && pw.toLowerCase().includes(email.split("@")[0].toLowerCase()) && email.split("@")[0].length >= 4) return "Don't include your email name in the password.";
  if (/^(.)\1+$/.test(pw) || /^(0123456789|1234567890|password|qwerty)/i.test(pw)) return "That password is too easy to guess.";
  return null;
}

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const key = await scrypt(pw.normalize("NFKC"), salt, LEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function checkPassword(pw: string, stored: string) {
  const [alg, n, r, p, salt, key] = stored.split("$");
  if (alg !== "scrypt" || !salt || !key) return false;
  const want = Buffer.from(key, "base64");
  const got = await scrypt(pw.normalize("NFKC"), Buffer.from(salt, "base64"), want.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Compare two strings without leaking how much of them matched. */
export function sameText(a: string, b: string) {
  const x = createHash("sha256").update(a).digest(), y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y) && a.length === b.length;
}

export async function setPassword(userId: string, pw: string) {
  const hash = await hashPassword(pw);
  await db.insert(schema.userPasswords).values({ userId, hash, changedAt: new Date() })
    .onConflictDoUpdate({ target: schema.userPasswords.userId, set: { hash, changedAt: new Date() } });
}

export async function storedHash(userId: string) {
  const [r] = await db.select({ hash: schema.userPasswords.hash }).from(schema.userPasswords).where(eq(schema.userPasswords.userId, userId)).limit(1);
  return r?.hash || null;
}

/* ── Slowing down guessing: 8 wrong tries for an email (or 30 from one address) in 15 minutes, then a pause. Kept in memory. ── */
const WINDOW = 15 * 60_000;
const fails = new Map<string, number[]>();
const recent = (k: string) => (fails.get(k) || []).filter((t) => Date.now() - t < WINDOW);
export function tooManyTries(email: string, ip: string) { return recent(`e:${email}`).length >= 8 || recent(`i:${ip}`).length >= 30; }
export function noteFailure(email: string, ip: string) {
  for (const k of [`e:${email}`, `i:${ip}`]) fails.set(k, [...recent(k), Date.now()]);
  if (fails.size > 5000) for (const [k] of fails) { if (!recent(k).length) fails.delete(k); }
}
export function clearFailures(email: string) { fails.delete(`e:${email}`); }

/* ── One-time links: "set your password" (from an admin) or "forgot password" (by email) ── */
const tokenHash = (t: string) => createHash("sha256").update(t).digest("hex");

export async function createPasswordLink(userId: string, createdById: string | null, hours = 24) {
  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.passwordTokens).values({ userId, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + hours * 3600_000), createdById });
  return `${appUrl()}/set-password?reset=${token}`;
}

/** The user a still-valid link belongs to, without using it up. */
export async function passwordLinkUser(token: string) {
  const [t] = await db.select().from(schema.passwordTokens)
    .where(and(eq(schema.passwordTokens.tokenHash, tokenHash(token)), isNull(schema.passwordTokens.usedAt), gt(schema.passwordTokens.expiresAt, new Date()))).limit(1);
  if (!t) return null;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, t.userId)).limit(1);
  return u && u.status === "active" ? { tokenId: t.id, user: u } : null;
}

/** Use the link up, and any other open links for the same person. */
export async function usePasswordLinks(userId: string) {
  await db.update(schema.passwordTokens).set({ usedAt: new Date() }).where(and(eq(schema.passwordTokens.userId, userId), isNull(schema.passwordTokens.usedAt)));
}
