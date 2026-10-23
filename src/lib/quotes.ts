import { randomBytes } from "crypto";
import { eq, like } from "drizzle-orm";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { db, schema } from "@/db";
import { HttpError } from "./http";
import { company, customLogo, who } from "./brand";
import { complete, parseJson } from "./llm";

export type Line = { description: string; qty: number; unitPrice: number };
export const totals = (lines: Line[], discountPct: number, taxRate: number) => {
  const gross = lines.reduce((n, l) => n + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0); const discount = gross * (discountPct || 0) / 100;
  const subtotal = Math.round((gross - discount) * 100) / 100; const tax = Math.round(subtotal * (taxRate || 0)) / 100;
  return { gross: Math.round(gross * 100) / 100, discount: Math.round(discount * 100) / 100, subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 };
};
export async function nextNumber() { const ym = new Date().toISOString().slice(0, 7).replace("-", ""); const n = await db.select({ n: schema.quotes.number }).from(schema.quotes).where(like(schema.quotes.number, `Q-${ym}-%`)); return `Q-${ym}-${String(n.length + 1).padStart(3, "0")}`; }
export const newToken = () => randomBytes(18).toString("base64url");
export const quoteDTO = (q: typeof schema.quotes.$inferSelect) => ({ ...q, sentAt: q.sentAt?.getTime() ?? null, firstViewedAt: q.firstViewedAt?.getTime() ?? null, respondedAt: q.respondedAt?.getTime() ?? null, createdAt: q.createdAt.getTime(), updatedAt: q.updatedAt.getTime() });

/** AI drafts a quote from the deal: title, introduction, lines and terms. */
export async function draftQuote(dealId: string) {
  const [d] = await db.select().from(schema.deals).where(eq(schema.deals.id, dealId)).limit(1); if (!d) throw new HttpError(404, "Deal not found.");
  const [co] = d.companyId ? await db.select().from(schema.companies).where(eq(schema.companies.id, d.companyId)).limit(1) : [];
  const [pr] = d.productId ? await db.select().from(schema.products).where(eq(schema.products.id, d.productId)).limit(1) : [];
  const acts = d.contactId ? (await db.select().from(schema.activities).where(eq(schema.activities.contactId, d.contactId))).filter((a) => a.type !== "email" && a.type !== "reply").slice(-8) : [];
  const us = await company();
  const prompt = `Draft a short commercial QUOTE from ${who(us)} for the deal "${d.name}" with ${co?.name || "the client"}. Deal value about ${d.currency} ${d.value}. Product: ${pr ? `${pr.name}: ${pr.description}` : "not set"}.
Recent notes: ${acts.map((a) => `${a.subject} ${a.body}`.slice(0, 300)).join(" | ") || "none"}.
Reply ONLY with JSON: {"title": "short quote title", "intro": "3 to 4 friendly, specific sentences addressed to the client", "lines": [{"description": "...", "qty": 1, "unitPrice": 0}], "terms": "payment terms and validity in 2 to 3 short sentences"}
Lines should add up to roughly the deal value; use 2 to 5 lines.`;
  const j = parseJson<{ title?: string; intro?: string; lines?: Line[]; terms?: string }>(await complete({ prompt, maxTokens: 1200 }), "{");
  return { title: String(j.title || d.name).slice(0, 200), intro: String(j.intro || ""), terms: String(j.terms || ""),
    lines: (Array.isArray(j.lines) ? j.lines : []).slice(0, 20).map((l) => ({ description: String(l.description || "").slice(0, 500), qty: Number(l.qty) || 1, unitPrice: Number(l.unitPrice) || 0 })) };
}

const safe = (s: string) => s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2022\u2026]/g, "-");
const fmtMoney = (n: number, cur: string) => { try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(n); } catch { return `${cur} ${n.toFixed(2)}`; } };
const fmtDay = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
function wrap(text: string, font: PDFFont, size: number, width: number) { const out: string[] = [];
  for (const para of safe(text).split("\n")) { let line = ""; for (const w of para.split(" ")) { const t = line ? `${line} ${w}` : w; if (font.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = w; } else line = t; } out.push(line); } return out; }
/** The branded quote PDF. */
export async function quotePdf(q: typeof schema.quotes.$inferSelect) {
  const [d] = await db.select().from(schema.deals).where(eq(schema.deals.id, q.dealId)).limit(1);
  const [co] = d?.companyId ? await db.select().from(schema.companies).where(eq(schema.companies.id, d.companyId)).limit(1) : [];
  const [ct] = d?.contactId ? await db.select().from(schema.contacts).where(eq(schema.contacts.id, d.contactId)).limit(1) : [];
  const s = await company(); const t = totals(q.lines, q.discountPct, q.taxRate);
  const pdf = await PDFDocument.create(); pdf.setTitle(`Quote ${q.number}`); pdf.setAuthor(s.name);
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.12, 0.18), muted = rgb(0.42, 0.45, 0.52), line = rgb(0.86, 0.88, 0.92), accent = rgb(0.18, 0.42, 0.94);
  let page: PDFPage = pdf.addPage([612, 792]); const M = 48, W = 612 - 2 * M; let y = 792 - M;
  const text = (s2: string, x: number, yy: number, o: { f?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {}) => page.drawText(safe(s2), { x, y: yy, size: o.size || 10, font: o.f || font, color: o.color || ink });
  const right = (s2: string, xr: number, yy: number, o: { f?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {}) => text(s2, xr - (o.f || font).widthOfTextAtSize(safe(s2), o.size || 10), yy, o);
  const room = (need: number) => { if (y - need < 60) { page = pdf.addPage([612, 792]); y = 792 - M; } };
  try { const own = await customLogo("logo"); if (!own) throw new Error("no logo"); const png = own.type === "image/png" ? await pdf.embedPng(own.data) : await pdf.embedJpg(own.data); const h = 26; page.drawImage(png, { x: M, y: y - h + 4, width: (png.width / png.height) * h, height: h }); } catch { text(s.name, M, y - 14, { f: bold, size: 16 }); }
  right("QUOTE", M + W, y - 12, { f: bold, size: 22, color: accent }); y -= 44;
  const from = [s.name, ...s.address.split("\n"), s.email, s.phone].filter(Boolean); from.forEach((l, i) => text(l, M, y - i * 13, { f: i ? font : bold, size: i ? 9 : 10, color: i ? muted : ink }));
  const meta: [string, string][] = [["Quote number", q.number], ["Date", fmtDay((q.sentAt || q.createdAt).toISOString().slice(0, 10))], ...(q.validUntil ? [["Valid until", fmtDay(q.validUntil)] as [string, string]] : [])];
  meta.forEach(([k, v], i) => { right(k, M + W - 130, y - i * 13, { size: 9, color: muted }); right(v, M + W, y - i * 13, { f: bold, size: 9 }); });
  y -= Math.max(from.length, meta.length) * 13 + 16;
  text("PREPARED FOR", M, y, { f: bold, size: 8, color: muted }); y -= 14;
  [co?.name || d?.name || "", ct?.name || "", ct?.email || ""].filter(Boolean).forEach((l, i) => { text(l, M, y, { f: i ? font : bold, size: i ? 9 : 11 }); y -= 13; }); y -= 10;
  if (q.title) { text(q.title, M, y, { f: bold, size: 14 }); y -= 20; }
  for (const l of wrap(q.intro, font, 10, W)) { room(14); text(l, M, y, { size: 10 }); y -= 14; } y -= 10;
  const cols = { qty: M + W - 200, rate: M + W - 100, amt: M + W };
  const head = () => { page.drawRectangle({ x: M, y: y - 6, width: W, height: 20, color: rgb(0.95, 0.96, 0.98) }); text("DESCRIPTION", M + 6, y, { f: bold, size: 8, color: muted }); right("QTY", cols.qty, y, { f: bold, size: 8, color: muted }); right("UNIT PRICE", cols.rate, y, { f: bold, size: 8, color: muted }); right("AMOUNT", cols.amt - 6, y, { f: bold, size: 8, color: muted }); y -= 24; };
  room(40); head();
  for (const l of q.lines) { const desc = wrap(l.description, font, 9, cols.qty - M - 70); if (y - desc.length * 12 < 120) { page = pdf.addPage([612, 792]); y = 792 - M; head(); }
    desc.forEach((x, i) => text(x, M + 6, y - i * 12, { size: 9 })); right(String(l.qty), cols.qty, y, { size: 9 }); right(fmtMoney(l.unitPrice, q.currency), cols.rate, y, { size: 9 }); right(fmtMoney(l.qty * l.unitPrice, q.currency), cols.amt - 6, y, { size: 9, f: bold });
    y -= desc.length * 12 + 8; page.drawLine({ start: { x: M, y: y + 12 }, end: { x: M + W, y: y + 12 }, thickness: 0.5, color: line }); }
  y -= 8; room(90);
  const rows: [string, string, boolean][] = [...(t.discount ? [["Subtotal before discount", fmtMoney(t.gross, q.currency), false], [`Discount (${q.discountPct}%)`, `-${fmtMoney(t.discount, q.currency)}`, false]] as [string, string, boolean][] : []), ["Subtotal", fmtMoney(t.subtotal, q.currency), false],
    ...(t.tax ? [[`Tax (${q.taxRate}%)`, fmtMoney(t.tax, q.currency), false] as [string, string, boolean]] : []), ["Total", fmtMoney(t.total, q.currency), true]];
  for (const [k, v, b] of rows) { right(k, M + W - 130, y, { size: b ? 11 : 9, f: b ? bold : font, color: b ? ink : muted }); right(v, M + W - 6, y, { size: b ? 12 : 9, f: bold, color: b ? accent : ink }); y -= b ? 20 : 14; }
  y -= 8; if (q.terms) { room(40); text("TERMS", M, y, { f: bold, size: 8, color: muted }); y -= 13; for (const l of wrap(q.terms, font, 9, W)) { room(12); text(l, M, y, { size: 9 }); y -= 12; } }
  y -= 10; room(20); text("To accept this quote, use the link in the email or reply to it.", M, y, { size: 9, color: muted });
  return Buffer.from(await pdf.save());
}
