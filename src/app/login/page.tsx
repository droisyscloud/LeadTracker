import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, devLoginEnabled, signIn, ssoProviderList } from "@/auth";
import { passwordEnabled, createPasswordLink } from "@/lib/password";
import { mailConfigured } from "@/lib/config";
import { sendSystemEmail } from "@/lib/mail";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/session";
import { ROLE_INFO } from "@/lib/rbac";
import { appName, company } from "@/lib/brand";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  NotInvited: "Your account has not been invited yet. Ask an admin to invite you, then sign in again.",
  Disabled: "Your access has been turned off. Contact an admin if this is a mistake.",
  NoEmail: "Your identity provider did not share an email address, so we could not match your account.",
  AccessDenied: "Sign-in was refused. Make sure you use your work account.",
  Configuration: "Sign-in is not configured correctly on this server. Contact your administrator.",
  OAuthCallbackError: "The sign-in was cancelled or timed out. Please try again.",
  CredentialsSignin: "That email and password don't match. Check them and try again.",
  TooManyTries: "Too many tries. Wait 15 minutes, then try again, or ask an admin for a password link.",
};

/** Email and password sign-in. A wrong password comes back to this page with a message instead of an error screen. */
async function passwordSignIn(fd: FormData) {
  "use server";
  try { await signIn("password", { email: String(fd.get("email") || ""), password: String(fd.get("password") || ""), redirectTo: "/home" }); }
  catch (e) {
    if (e instanceof AuthError) redirect(`/login?error=${(e as { code?: string }).code === "TooManyTries" ? "TooManyTries" : "CredentialsSignin"}&email=${encodeURIComponent(String(fd.get("email") || ""))}`);
    throw e;
  }
}

/** "Forgot password": email a one-time link, if this server can send email. The reply is the same whether or not the address has an account. */
async function forgotPassword(fd: FormData) {
  "use server";
  const email = String(fd.get("email") || "").trim().toLowerCase();
  if (email && mailConfigured()) {
    const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (u && u.status === "active") {
      const link = await createPasswordLink(u.id, null, 1);
      await sendSystemEmail({ to: email, subject: `Set a new password for ${appName()}`, text: `Hi,\n\nSomeone asked to reset the password for this email address. To choose a new password, open this link within the next hour:\n\n${link}\n\nIf this wasn't you, you can ignore this email; your password stays the same.\n\n${(await company()).name}` }).catch((e) => console.error("reset email", e));
    }
  }
  redirect("/login?sent=1");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  if (await getCurrentUser()) redirect("/home");
  const session = await auth();
  const staleSession = !!session?.user?.email;
  let invite: { role: string; inviter: string | null; email: string } | null = null;
  if (sp.invite) {
    try {
      const [i] = await db.select().from(schema.invites).where(eq(schema.invites.token, sp.invite)).limit(1);
      if (i && i.status === "pending") {
        const [by] = i.invitedById ? await db.select().from(schema.users).where(eq(schema.users.id, i.invitedById)).limit(1) : [];
        invite = { role: ROLE_INFO[i.role].label, inviter: by ? by.name || by.email : null, email: i.email };
      }
    } catch { /* database not ready; show the plain page */ }
  }
  const error = sp.error ? ERRORS[sp.error] || ERRORS.AccessDenied : staleSession ? ERRORS.Disabled : null;
  const sso = ssoProviderList;
  const pw = passwordEnabled();
  const us = await company();
  return (
    <div className="signin">
      <div className="panel card">
        <img className="logo" src="/api/public/brand/logo" alt={us.name} />
        <h1>{appName()}</h1>
        <p className="muted" style={{ margin: 0 }}>{invite ? `${invite.inviter || "Your team"} invited ${invite.email} to join as ${invite.role}.${pw ? "" : " Sign in with that work account to accept."}` : sp.forgot ? (mailConfigured() ? "Enter your email and we'll send you a link to set a new password." : "Forgot your password? An admin can give you a link to set a new one.") : `Sign in with your ${us.name} work account.`}</p>
        {sp.signedout && !error && <div className="banner err" style={{ margin: "16px 0 0" }}>You are signed out.</div>}
        {sp.sent && <div className="banner" style={{ margin: "16px 0 0" }}>If that email has an account, a link to set a new password is on its way. It works for one hour.</div>}
        {sp.done && <div className="banner" style={{ margin: "16px 0 0" }}>Your password is set. Sign in with it below.</div>}
        {error && <div className="banner err" style={{ margin: "16px 0 0", borderColor: "var(--cold)" }}>{error}</div>}
        {pw && invite && sp.invite && <div className="providers"><a className="btn primary" href={`/set-password?invite=${encodeURIComponent(sp.invite)}`} style={{ width: "100%", justifyContent: "center" }}>Choose a password and join</a></div>}
        {pw && !invite && sp.forgot && (mailConfigured()
          ? <form className="pwlogin" action={forgotPassword}>
              <label>Email<input type="email" name="email" autoComplete="email" required /></label>
              <button className="btn primary" type="submit">Email me a link</button>
              <a className="small" href="/login">Back to sign in</a>
            </form>
          : <div className="pwlogin"><div className="banner" style={{ margin: 0, textAlign: "left" }}>Ask an admin to open <b>Users &amp; access</b> and click <b>Password link</b> next to your name. They send you the link; it works once, for 24 hours.</div><a className="small" href="/login">Back to sign in</a></div>)}
        {pw && !invite && !sp.forgot && (
          <form className="pwlogin" action={passwordSignIn}>
            <label>Email<input type="email" name="email" autoComplete="username" defaultValue={sp.email || ""} required /></label>
            <label>Password<input type="password" name="password" autoComplete="current-password" required /></label>
            <button className="btn primary" type="submit">Sign in</button>
            <a className="small" href="/login?forgot=1">Forgot password?</a>
          </form>
        )}
        {pw && !sp.forgot && sso.length > 0 && <div className="or-line"><span>or</span></div>}
        {!sp.forgot && <div className="providers">
          {sso.map((p) => (
            <form key={p.id} action={async () => { "use server"; await signIn(p.id, { redirectTo: "/home" }); }}>
              <button className={pw ? "btn" : "btn primary"} type="submit" style={{ width: "100%" }}>Sign in with {p.id === "microsoft-entra-id" ? "Microsoft" : p.name}</button>
            </form>
          ))}
          {!sso.length && !devLoginEnabled() && !pw && <div className="banner" style={{ margin: 0, textAlign: "left" }}>No sign-in method is set up yet. Turn on email and password (AUTH_EMAIL_PASSWORD=true and ADMIN_INITIAL_PASSWORD), or set up Google or Microsoft sign-in, as described in DEPLOY.md.</div>}
        </div>}
        {devLoginEnabled() && (
          <form className="devlogin" action={async (fd: FormData) => { "use server"; await signIn("dev", { email: String(fd.get("email") || ""), redirectTo: "/home" }); }}>
            <span className="small muted">Developer login (local only, disabled in production)</span>
            <input type="email" name="email" placeholder="you@yourcompany.com" required />
            <button className="btn" type="submit">Sign in as this email</button>
          </form>
        )}
        <p className="fine">{pw && !sso.length ? "Access is by invitation." : "Protected by single sign-on. Access is by invitation."}</p>
      </div>
    </div>
  );
}
