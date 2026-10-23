import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { prepareAll, stepAudio, voiceStatus } from "@/lib/demoVoice";

export const maxDuration = 300;
/** ?id=<step>: that step's narration as audio. ?status=1: how much is ready. */
export async function GET(req: Request) {
  try { await requireUser("viewer"); } catch { return Response.json({ error: "Sign in to continue." }, { status: 401 }); }
  const q = new URL(req.url).searchParams;
  if (q.get("status")) return Response.json(await voiceStatus());
  try {
    const buf = await stepAudio(String(q.get("id") || ""));
    if (!buf) return Response.json({ error: "No voice available." }, { status: 404 });
    return new Response(new Uint8Array(buf), { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=31536000, immutable" } });
  } catch (e) { console.error("voice", e); return Response.json({ error: "The voice couldn't be made just now." }, { status: 502 }); }
}
/** Admins: make every step's narration now. */
export const POST = route(async () => {
  await requireUser("admin");
  const r = await prepareAll();
  if (!r.available) throw new HttpError(400, "Add an OpenAI key (OPENAI_API_KEY) in Render to use the natural voice.");
  return ok(r);
});
