import { ok, route } from "@/lib/http";
import { getCurrentUser } from "@/lib/session";
import { getState, setState } from "@/lib/jobstate";

/** A device reports a microphone problem (kept: the last 40), so admins can see what's going wrong on people's phones and computers. */
export const POST = route(async (req: Request) => {
  const u = await getCurrentUser(); if (!u) return ok({ ok: true });
  const j = await req.json().catch(() => ({})) as { kind?: string; name?: string; message?: string; ua?: string };
  const cur = ((await getState("client-log:mic")) || { items: [] }) as { items: { who: string; name: string; message: string; device: string; at: number }[] };
  const device = String(j.ua || "").replace(/Mozilla\/5\.0 /, "").slice(0, 160);
  const items = [{ who: u.name || u.email, name: String(j.name || "").slice(0, 60), message: String(j.message || "").slice(0, 300), device, at: Date.now() }, ...cur.items].slice(0, 40);
  await setState("client-log:mic", { items });
  return ok({ ok: true });
});
