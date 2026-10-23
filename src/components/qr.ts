"use client";
/**
 * Reading QR codes on the phone itself (works with no signal).
 * Uses the browser's built-in barcode reader where there is one (Chrome on Android), otherwise jsQR.
 */
export type QrContact = { name: string; title: string; company: string; email: string; phone: string; website: string; raw: string; kind: "vcard" | "mecard" | "contact" | "link" | "code" };

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
let detector: Detector | null | undefined;
async function native(): Promise<Detector | null> {
  if (detector !== undefined) return detector;
  const BD = (globalThis as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  try { detector = BD && (!BD.getSupportedFormats || (await BD.getSupportedFormats()).includes("qr_code")) ? new BD({ formats: ["qr_code"] }) : null; } catch { detector = null; }
  return detector;
}
let jsqr: typeof import("jsqr").default | null = null;
async function fallback(data: ImageData) {
  if (!jsqr) jsqr = (await import("jsqr")).default;
  return jsqr(data.data, data.width, data.height, { inversionAttempts: "attemptBoth" })?.data || null;
}

/** Look for a QR code in what's drawn on this canvas. */
export async function decodeCanvas(c: HTMLCanvasElement): Promise<string | null> {
  const d = await native();
  if (d) { try { const r = await d.detect(c); if (r[0]?.rawValue) return r[0].rawValue; } catch { /* fall through */ } }
  const ctx = c.getContext("2d", { willReadFrequently: true }); if (!ctx) return null;
  return fallback(ctx.getImageData(0, 0, c.width, c.height));
}

/** Look for a QR code in a photo. Tries the whole photo at two sizes (small codes in big photos, and the reverse). */
export async function decodePhoto(blob: Blob): Promise<string | null> {
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(blob); } catch { return null; }
  for (const max of [1600, 900]) {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const t = await decodeCanvas(c); if (t) return t;
  }
  return null;
}

const unesc = (s: string) => s.replace(/\\([,;:\\])/g, "$1").replace(/\\n/gi, " ").trim();
/** Turn what a QR code holds into contact details: vCard, MeCard, email/phone links, or anything else kept as text. */
export function parseQr(raw: string): QrContact {
  const out: QrContact = { name: "", title: "", company: "", email: "", phone: "", website: "", raw: raw.trim(), kind: "code" };
  const t = raw.trim();
  if (/^BEGIN:VCARD/i.test(t)) {
    out.kind = "vcard";
    const lines = t.replace(/\r\n[ \t]/g, "").split(/\r?\n/);
    for (const l of lines) {
      const i = l.indexOf(":"); if (i < 0) continue;
      const key = l.slice(0, i).split(";")[0].toUpperCase(); const v = unesc(l.slice(i + 1));
      if (key === "FN" && v) out.name = v;
      else if (key === "N" && !out.name) { const [last, first] = v.split(";"); out.name = [first, last].filter(Boolean).join(" ").trim(); }
      else if (key === "ORG" && !out.company) out.company = v.split(";")[0].trim();
      else if (key === "TITLE" && !out.title) out.title = v;
      else if (key === "EMAIL" && !out.email) out.email = v;
      else if (key === "TEL" && !out.phone) out.phone = v;
      else if (key === "URL" && !out.website) out.website = v;
    }
    return out;
  }
  if (/^MECARD:/i.test(t)) {
    out.kind = "mecard";
    for (const part of t.slice(7).split(/(?<!\\);/)) {
      const i = part.indexOf(":"); if (i < 0) continue;
      const key = part.slice(0, i).toUpperCase(); const v = unesc(part.slice(i + 1));
      if (key === "N") { const [last, first] = v.split(","); out.name = first ? `${first.trim()} ${last.trim()}` : v; }
      else if (key === "ORG") out.company = v; else if (key === "TITLE") out.title = v; else if (key === "EMAIL") out.email = v; else if (key === "TEL" && !out.phone) out.phone = v; else if (key === "URL") out.website = v;
    }
    return out;
  }
  if (/^mailto:/i.test(t)) { out.kind = "contact"; out.email = decodeURIComponent(t.slice(7).split("?")[0]); return out; }
  if (/^tel:/i.test(t)) { out.kind = "contact"; out.phone = t.slice(4); return out; }
  const email = t.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (email && t.length < 400) {
    out.kind = "contact"; out.email = email;
    // simple "Name | Company | email" style badges
    const parts = t.split(/[|\n;]+/).map((x) => x.trim()).filter((x) => x && x !== email && !/^https?:/i.test(x));
    if (parts[0] && /^[\p{L} .'-]{3,60}$/u.test(parts[0])) out.name = parts[0];
    if (parts[1] && parts[1].length <= 80) out.company = parts[1];
    return out;
  }
  if (/^https?:\/\//i.test(t)) { out.kind = "link"; out.website = t; return out; }
  return out;
}
/** True when the code held contact details we could use. */
export const hasDetails = (q: QrContact) => !!(q.name || q.email || q.phone || q.company);
