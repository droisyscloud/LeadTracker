import { eq, and } from "drizzle-orm";
import { db, schema } from "@/db";
import { ensureCompany } from "@/lib/leads";
import { cleanEmail, websiteFromEmail } from "@/lib/normalize";
import { fireWebhook } from "@/lib/webhooks";
import { announce } from "@/lib/chat";
import { appUrl } from "@/lib/config";

/** Public endpoint for website forms. Needs a key from INTAKE_KEYS. Rate-limited per IP. */
const hits = new Map<string, number[]>();
const keys = () => (process.env.INTAKE_KEYS || "").split(",").map((k) => k.trim()).filter(Boolean);
const origins = () => (process.env.INTAKE_ALLOWED_ORIGINS || "").split(",").map((k) => k.trim()).filter(Boolean);
function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin");
  return o && origins().includes(o) ? { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-Intake-Key", Vary: "Origin" } : {};
}
const reply = (req: Request, status: number, data: Record<string, unknown>) => Response.json(data, { status, headers: cors(req) });
export async function OPTIONS(req: Request) { return new Response(null, { status: 204, headers: cors(req) }); }

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  const now = Date.now(); const recent = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  if (recent.length >= Number(process.env.INTAKE_RATE_PER_HOUR || 30)) return reply(req, 429, { error: "Too many submissions. Try again later." });
  hits.set(ip, [...recent, now]);
  let f: Record<string, string> = {};
  const ct = req.headers.get("content-type") || "";
  try {
    if (ct.includes("json")) f = await req.json();
    else { const fd = await req.formData(); fd.forEach((v, k) => { if (typeof v === "string") f[k] = v; }); }
  } catch { return reply(req, 400, { error: "Could not read the form." }); }
  const url = new URL(req.url);
  const key = req.headers.get("x-intake-key") || url.searchParams.get("key") || f.key || "";
  if (!keys().length || !keys().includes(key)) return reply(req, 401, { error: "Invalid form key." });
  if (f.website_url) return reply(req, 200, { ok: true });
  const name = String(f.name || [f.first_name, f.last_name].filter(Boolean).join(" ")).trim().slice(0, 200);
  const email = cleanEmail(f.email).slice(0, 320);
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply(req, 400, { error: "Name and a valid email are required." });
  const [existing] = await db.select().from(schema.contacts).where(and(eq(schema.contacts.email, email), eq(schema.contacts.personal, false))).limit(1);
  let contactId = existing?.id;
  if (!contactId) {
    const companyId = await ensureCompany(String(f.company || "").slice(0, 200), websiteFromEmail(email), null);
    const [c] = await db.insert(schema.contacts).values({ name, email, title: String(f.title || "").slice(0, 200), phone: String(f.phone || "").slice(0, 60), companyId,
      source: String(f.source || "Website form").slice(0, 100), tags: ["Immediate follow-up"] }).returning();
    contactId = c.id;
    await fireWebhook("lead.created", { contactId, name, email, source: c.source });
    await announce("webLead", `🌐 New website lead: ${name}${f.company ? ` (${String(f.company).slice(0, 100)})` : ""}, ${email}. Unassigned, waiting for a manager to hand it out. ${appUrl()}/contacts?id=${contactId}`);
  }
  const msg = String(f.message || "").slice(0, 5000);
  await db.insert(schema.activities).values({ contactId, type: "request", kind: "Website enquiry", body: msg || "Submitted the website form.", origin: "intake" });
  const back = f.redirect || url.searchParams.get("redirect");
  if (back && /^https?:\/\//.test(back) && !ct.includes("json")) return Response.redirect(back, 303);
  return reply(req, 201, { ok: true });
}
