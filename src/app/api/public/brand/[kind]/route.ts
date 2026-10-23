import { readFile } from "fs/promises";
import path from "path";
import { company, customLogo, type LogoKind } from "@/lib/brand";

export const dynamic = "force-dynamic";

/** Width for the name in the default logo, from rough letter widths of a bold sans font at 36px, with room to spare (tested so nothing is cut off). */
function logoWidth(name: string) {
  let em = 0;
  for (const ch of name) {
    if (ch.codePointAt(0)! >= 0x2e80) em += 1.05;   // Chinese, Japanese, Korean
    else if ("iljI.,:;'|!".includes(ch)) em += 0.3;
    else if ("ftr ".includes(ch)) em += 0.4;
    else if ("mwMW@".includes(ch)) em += 0.98;
    else if (ch !== ch.toLowerCase()) em += 0.78;
    else if (/[0-9]/.test(ch)) em += 0.6;
    else em += 0.64;
  }
  return Math.round(84 + em * 36 * 1.06 + 10);
}

/** The company logo (wide) or mark (square), for the app, sign-in, booking and quote pages. No sign-in needed. */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (kind !== "logo" && kind !== "mark") return new Response("Not found", { status: 404 });
  const img = await customLogo(kind as LogoKind);
  if (!img && kind === "logo") {   // no logo uploaded yet: the default mark with the company's name beside it
    const raw = (await company()).name;
    const name = raw.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    const w = logoWidth(raw);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="70" viewBox="0 0 ${w} 70"><circle cx="35" cy="35" r="30.5" fill="none" stroke="#1F1F1F" stroke-width="9"/><circle cx="35" cy="35" r="12" fill="#1F1F1F"/><text x="84" y="47" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="36" font-weight="700" fill="#1F1F1F">${name}</text></svg>`;
    return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-cache", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" } });
  }
  if (!img) {   // the default square icon shipped in /public
    const buf = await readFile(path.join(/* turbopackIgnore: true */ process.cwd(), "public", "logo-mark.png"));
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" } });
  }
  const etag = `"${kind}-${img.at}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
  return new Response(new Uint8Array(img.data), { headers: { "Content-Type": img.type, "Cache-Control": "no-cache", ETag: etag, "X-Content-Type-Options": "nosniff" } });
}
