import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Google from "next-auth/providers/google";
import Okta from "next-auth/providers/okta";
import Credentials from "next-auth/providers/credentials";
import { CredentialsSignin } from "next-auth";
import { eq } from "drizzle-orm";
import { admitUser } from "@/lib/admission";
import { saveConnection } from "@/lib/oauth";
import { db, schema } from "@/db";
import { checkPassword, clearFailures, noteFailure, passwordEnabled, sameText, setPassword, storedHash, tooManyTries } from "@/lib/password";

class TooManyTries extends CredentialsSignin { code = "TooManyTries"; }

const env = process.env;
// Read NODE_ENV at runtime (not inlined at build time) so a production build can be tested with NODE_ENV=test.
const NODE_ENV_KEY = ["NODE", "ENV"].join("_");
export const devLoginEnabled = () => env.AUTH_DEV_LOGIN === "true" && process.env[NODE_ENV_KEY] !== "production";

function buildProviders(): Provider[] {
  const p: Provider[] = [];
  if (env.AUTH_MICROSOFT_ENTRA_ID_ID) {
    p.push(MicrosoftEntraID({
      clientId: env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: env.AUTH_MICROSOFT_ENTRA_ID_ISSUER || `https://login.microsoftonline.com/${env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID || "common"}/v2.0`,
    }));
  }
  if (env.AUTH_GOOGLE_ID) {
    p.push(Google({
      clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET,
      authorization: env.AUTH_GOOGLE_HOSTED_DOMAIN ? { params: { hd: env.AUTH_GOOGLE_HOSTED_DOMAIN, prompt: "select_account" } } : { params: { prompt: "select_account" } },
    }));
  }
  if (env.AUTH_OKTA_ID) {
    p.push(Okta({ clientId: env.AUTH_OKTA_ID, clientSecret: env.AUTH_OKTA_SECRET, issuer: env.AUTH_OKTA_ISSUER }));
  }
  if (env.AUTH_OIDC_ISSUER) {
    p.push({
      id: "oidc", name: env.AUTH_OIDC_NAME || "Company SSO", type: "oidc",
      issuer: env.AUTH_OIDC_ISSUER, clientId: env.AUTH_OIDC_ID, clientSecret: env.AUTH_OIDC_SECRET,
      authorization: { params: { scope: "openid email profile" } },
    });
  }
  if (passwordEnabled()) {
    // Email and password: for companies without Google Workspace or Microsoft 365 admin access.
    p.push(Credentials({
      id: "password", name: "Email and password",
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      authorize: async (c, req) => {
        const email = String(c?.email || "").trim().toLowerCase(), pw = String(c?.password || "");
        const ip = (req?.headers?.get?.("x-forwarded-for") || "").split(",")[0].trim() || "local";
        if (!email || !pw) return null;
        if (tooManyTries(email, ip)) throw new TooManyTries();
        const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
        const hash = u ? await storedHash(u.id) : null;
        let ok = false, first = false;
        if (hash) ok = await checkPassword(pw, hash);
        else {
          // the very first admin: the password chosen at setup (ADMIN_INITIAL_PASSWORD), until they set their own
          const boot = (env.BOOTSTRAP_ADMIN_EMAILS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
          const initial = env.ADMIN_INITIAL_PASSWORD || "";
          if (boot.includes(email) && initial.length >= 10) { ok = sameText(pw, initial); first = ok; }
        }
        if (!ok) { noteFailure(email, ip); return null; }
        clearFailures(email);
        return { id: email, email, name: u?.name || email.split("@")[0], ...(first ? { firstPassword: pw } : {}) };
      },
    }));
  }
  if (devLoginEnabled()) {
    p.push(Credentials({
      id: "dev", name: "Developer login",
      credentials: { email: { label: "Email", type: "email" } },
      authorize: async (c) => {
        const email = String(c?.email || "").trim().toLowerCase();
        return email ? { id: email, email, name: email.split("@")[0] } : null;
      },
    }));
  }
  return p;
}

export const providers = buildProviders();
type ProviderInfo = { id: string; name: string; type: string; options?: { id?: string; name?: string } };
/** SSO buttons for the login page. Email and password, and the developer login, are listed separately. */
export const ssoProviderList = providers
  .map((p) => (typeof p === "function" ? p() : p) as unknown as ProviderInfo)
  .filter((p) => p.type !== "credentials")
  .map((p) => ({ id: p.options?.id || p.id, name: p.options?.name || p.name, type: p.type }));

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  trustHost: true,
  session: { strategy: "jwt", maxAge: Number(env.SESSION_MAX_AGE_HOURS || 12) * 3600 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ user, profile, account }) {
      const p = (profile || {}) as Record<string, unknown>;
      const email = String(user.email || p.email || p.preferred_username || p.upn || "").trim().toLowerCase();
      if (!email || !email.includes("@")) return "/login?error=NoEmail";
      const res = await admitUser({ email, name: user.name || (p.name as string) || null, image: user.image || null });
      if (res !== "ok") return `/login?error=${res}`;
      // first admin signed in with the setup password: keep it as their own (hashed), so the setting is no longer needed
      const firstPw = (user as { firstPassword?: string }).firstPassword;
      if (account?.provider === "password" && firstPw) {
        const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
        if (u && !(await storedHash(u.id))) await setPassword(u.id, firstPw);
      }
      // "Connect mailbox and calendar" re-runs SSO with extra scopes; keep those tokens for sync and booking.
      const scope = String(account?.scope || "");
      if (account && /Mail\.Read|gmail\.readonly/i.test(scope)) {
        const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
        if (u) await saveConnection(u.id, account.provider === "google" ? "google" : "microsoft", email, account as never);
      }
      return true;
    },
    async jwt({ token, user, profile }) {
      if (user) {
        const p = (profile || {}) as Record<string, unknown>;
        token.email = String(user.email || p.email || p.preferred_username || p.upn || "").toLowerCase();
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.email) session.user.email = String(token.email);
      return session;
    },
  },
});
