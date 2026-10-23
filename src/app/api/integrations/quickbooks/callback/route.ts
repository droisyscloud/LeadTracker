import { cookies } from "next/headers";
import { requireUser } from "@/lib/session";
import { finishConnect, syncQuickBooks } from "@/lib/qbo";
import { audit } from "@/lib/audit";

/** QuickBooks sends the admin back here after they approve the connection. */
export async function GET(req: Request) {
  const u = new URL(req.url); const back = (q: string) => Response.redirect(new URL(`/settings?quickbooks=${q}`, u.origin).toString(), 302);
  try {
    const me = await requireUser("admin"); const jar = await cookies(); const state = jar.get("qbo_state")?.value; jar.delete("qbo_state");
    if (!state || state !== u.searchParams.get("state")) return back("error");
    const code = u.searchParams.get("code"), realm = u.searchParams.get("realmId"); if (!code || !realm) return back("cancelled");
    await finishConnect(code, realm, me.id); await audit(me.id, "accounting.connected", "settings", null, { provider: "quickbooks" });
    await syncQuickBooks().catch(() => undefined);
    return back("connected");
  } catch { return back("error"); }
}
