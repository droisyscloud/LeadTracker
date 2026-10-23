import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "crypto";

const key = () => createHash("sha256").update(process.env.TOKEN_ENCRYPTION_KEY || process.env.AUTH_SECRET || "dev-only-key").digest();
/** AES-256-GCM. Output: base64url(iv).base64url(tag).base64url(ciphertext) */
export function encrypt(plain: string): string {
  const iv = randomBytes(12); const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}
export function decrypt(blob: string): string {
  const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key(), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
export const sign = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("hex");
