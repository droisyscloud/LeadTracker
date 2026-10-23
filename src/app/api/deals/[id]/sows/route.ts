import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { requireDealMoney } from "@/lib/payments";
import { putFile } from "@/lib/storage";
import { documentText } from "@/lib/doctext";
import { readSow, sowDTO } from "@/lib/billing";
import { aiConfigured } from "@/lib/config";
import { audit } from "@/lib/audit";
import { requireCap } from "@/lib/permissions";

export const maxDuration = 120;
/** Attach a signed SOW to a deal; AI reads its payment terms and returns a draft billing schedule to review. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("rep"); await requireCap(me, "billing");
  const { id } = await params;
  const deal = await requireDealMoney(me, id);
  const form = await req.formData().catch(() => { throw new HttpError(400, "Send the SOW as a file."); });
  const f = form.get("file");
  if (!f || typeof f !== "object" || !("arrayBuffer" in f) || !(f as File).size) throw new HttpError(400, "Choose the SOW file to attach.");
  const file = f as File;
  if (file.size > 25 * 1024 * 1024) throw new HttpError(413, "The SOW is larger than 25 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  let text = "";
  try { text = (await documentText(buf, file.type, file.name)).trim(); }
  catch (e) { if ((e as Error).message === "unsupported") throw new HttpError(415, "Attach the SOW as a PDF, Word (.docx) or text file."); throw new HttpError(422, "The document couldn't be read. If it's a scanned PDF, attach a text PDF or Word version."); }
  if (text.length < 40) throw new HttpError(422, "No readable text was found in that document. Scanned PDFs need to be a text PDF or Word version.");
  const key = await putFile(buf, file.type || "application/octet-stream");
  const [row] = await db.insert(schema.files).values({ name: file.name, contentType: file.type || "application/octet-stream", size: file.size, storageKey: key, uploadedById: me.id }).returning();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone || undefined });
  const read = aiConfigured() ? await readSow(text, { name: deal.name, value: deal.value, currency: deal.currency }, today).catch((e) => { console.error("sow read failed", e); return null; }) : null;
  const [sow] = await db.insert(schema.sows).values({ dealId: id, fileId: row.id, title: read?.title || file.name.replace(/\.[^.]+$/, ""), value: read?.value ?? null, currency: read?.currency || deal.currency,
    startDate: read?.startDate ?? null, endDate: read?.endDate ?? null, poNumber: read?.poNumber || "", billingContact: read?.billingContact || "", netDays: read?.netDays ?? null,
    sowNumber: read?.sowNumber || "", sowType: (read?.sowType || "") as "fixed" | "milestone" | "tm" | "retainer" | "other" | "",
    termsSummary: read?.summary || "", extracted: read ? (read as unknown as Record<string, unknown>) : null, createdById: me.id }).returning();
  await audit(me.id, "sow.attached", "deal", id, { file: file.name, read: !!read });
  return ok({ sow: sowDTO(sow), draft: read ? { items: read.items, warnings: read.warnings } : { items: [], warnings: [aiConfigured() ? "AI couldn't read the payment terms. Add the billing schedule by hand." : "AI isn't turned on, so add the billing schedule by hand."] } }, 201);
});
