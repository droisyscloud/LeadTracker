import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { db, schema } from "@/db";
import { admitUser } from "@/lib/admission";
import { appName, company } from "@/lib/brand";
import { audit } from "@/lib/audit";
import { MIN_PASSWORD, passwordEnabled, passwordLinkUser, passwordProblem, setPassword, storedHash, usePasswordLinks } from "@/lib/password";
import { ROLE_INFO } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set your password", robots: { index: false, follow: false } };

type SP = { invite?: string; reset?: string; error?: string };

/** What the link is for: joining from an invitation, or setting a new password from a one-time link. */
async function whatFor(sp: SP) {
  if (sp.invite) {
    const [i] = await db.select().from(schema.invites).where(eq(schema.invites.token, sp.invite)).limit(1);
    if (!i || i.status !== "pending") return null;
    return { kind: "invite" as const, email: i.email, role: ROLE_INFO[i.role].label };
  }
  if (sp.reset) {
    const r = await passwordLinkUser(sp.reset);
    return r ? { kind: "reset" as const, email: r.user.email, userId: r.user.id } : null;
  }
  return null;
}

async function save(fd: FormData) {
  "use server";
  const sp: SP = { invite: String(fd.get("invite") || "") || undefined, reset: String(fd.get("reset") || "") || undefined };
  const back = (msg: string) => redirect(`/set-password?${sp.invite ? `invite=${encodeURIComponent(sp.invite)}` : `reset=${encodeURIComponent(sp.reset || "")}`}&error=${encodeURIComponent(msg)}`);
  if (!passwordEnabled()) redirect("/login");
  const it = await whatFor(sp);
  if (!it) redirect("/set-password");
  const pw = String(fd.get("password") || ""), again = String(fd.get("again") || "");
  const problem = passwordProblem(pw, it.email);
  if (problem) back(problem);
  if (pw !== again) back("The two passwords don't match.");

  let userId: string;
  if (it.kind === "invite") {
    const res = await admitUser({ email: it.email, name: String(fd.get("name") || "").trim().slice(0, 120) || null, image: null });
    if (res !== "ok") redirect(`/login?error=${res}`);
    const [u] = await db.select().from(schema.users).where(eq(schema.users.email, it.email)).limit(1);
    if (!u) redirect("/login?error=NotInvited");
    if (await storedHash(u.id)) redirect("/login?done=1");   // already joined: just sign in
    userId = u.id;
  } else userId = it.userId;

  await setPassword(userId, pw);
  await usePasswordLinks(userId);
  await audit(userId, "user.password_set", "user", userId, { via: it.kind });
  try { await signIn("password", { email: it.email, password: pw, redirectTo: "/home" }); }
  catch (e) { if (e instanceof AuthError) redirect("/login?done=1"); throw e; }
}

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  if (!passwordEnabled()) redirect("/login");
  const it = await whatFor(sp).catch(() => null);
  const us = await company();
  return (
    <div className="signin">
      <div className="panel card">
        <img className="logo" src="/api/public/brand/logo" alt={us.name} />
        <h1>{it?.kind === "invite" ? `Join ${appName()}` : "Set your password"}</h1>
        {!it ? <>
          <div className="banner err" style={{ margin: "16px 0 0", textAlign: "left" }}>This link has expired or has already been used. Ask an admin for a new one, or use &quot;Forgot password?&quot; on the sign-in page.</div>
          <p className="fine"><a href="/login">Go to sign in</a></p>
        </> : <>
          <p className="muted" style={{ margin: 0 }}>{it.kind === "invite" ? `You're joining ${us.name} as ${it.role}. Choose a password for ${it.email}.` : `Choose a new password for ${it.email}.`}</p>
          {sp.error && <div className="banner err" style={{ margin: "16px 0 0", borderColor: "var(--cold)" }}>{sp.error}</div>}
          <form className="pwlogin" action={save}>
            <input type="hidden" name="invite" value={sp.invite || ""} />
            <input type="hidden" name="reset" value={sp.reset || ""} />
            <input type="email" name="username" autoComplete="username" value={it.email} readOnly hidden />
            {it.kind === "invite" && <label>Your name<input type="text" name="name" autoComplete="name" placeholder="First and last name" /></label>}
            <label>Password<input type="password" name="password" autoComplete="new-password" minLength={MIN_PASSWORD} required /></label>
            <label>Password again<input type="password" name="again" autoComplete="new-password" minLength={MIN_PASSWORD} required /></label>
            <p className="pw-hint">At least {MIN_PASSWORD} characters. A short sentence you&apos;ll remember works well.</p>
            <button className="btn primary" type="submit">{it.kind === "invite" ? "Join" : "Save password"}</button>
          </form>
        </>}
      </div>
    </div>
  );
}
