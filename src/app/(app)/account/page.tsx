import { signIn, signOut, ssoProviderList } from "@/auth";
import { GOOGLE_SCOPES, MS_SCOPES } from "@/lib/oauth";
import { AccountView } from "@/components/views/AccountView";
import { passwordEnabled } from "@/lib/password";

async function signOutAction() { "use server"; await signOut({ redirectTo: "/login?signedout=1" }); }
async function connectMicrosoft() { "use server"; await signIn("microsoft-entra-id", { redirectTo: "/account?connected=1" }, { scope: MS_SCOPES, prompt: "consent" }); }
async function connectGoogle() { "use server"; await signIn("google", { redirectTo: "/account?connected=1" }, { scope: GOOGLE_SCOPES, access_type: "offline", prompt: "consent", include_granted_scopes: "true" }); }

export default function Page() {
  const names = ssoProviderList.map((p) => (p.id === "microsoft-entra-id" ? "Microsoft Entra ID" : p.name));
  return <AccountView signOutAction={signOutAction} connectMicrosoft={connectMicrosoft} connectGoogle={connectGoogle}
    passwordAuth={passwordEnabled()}
    provider={[passwordEnabled() ? "Email and password" : "", names.length ? `Single sign-on (${names.join(", ")})` : ""].filter(Boolean).join(" or ") || "Developer login"} />;
}
