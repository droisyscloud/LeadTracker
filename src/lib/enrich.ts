import { lookup } from "dns/promises";
import { isIP } from "net";
import { complete } from "./llm";
import { aiConfigured } from "./config";

function privateIp(ip: string) {
  if (isIP(ip) === 6) return ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80") || ip.startsWith("::ffff:127.") || ip.startsWith("::ffff:10.") || ip.startsWith("::ffff:192.168.");
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}
const pick = (html: string, re: RegExp) => (html.match(re)?.[1] || "").replace(/\s+/g, " ").trim();
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** Reads the company's public homepage. Refuses private network addresses. */
export async function fetchCompanySite(website: string) {
  const url = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only http and https websites can be read.");
  const { address } = await lookup(url.hostname);
  if (privateIp(address)) throw new Error("That website address is not allowed.");
  const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10000), headers: { "User-Agent": "LeadTracker/1.0 (+company enrichment)", Accept: "text/html" } });
  if (!r.ok) throw new Error(`The website returned ${r.status}.`);
  const html = (await r.text()).slice(0, 600_000);
  const title = decode(pick(html, /<title[^>]*>([^<]*)<\/title>/i));
  const description = decode(pick(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || pick(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i));
  const siteName = decode(pick(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["']/i));
  const text = decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).slice(0, 8000);
  return { title, description, siteName, text };
}

export async function enrichCompany(name: string, website: string): Promise<{ description: string; industry: string; location: string }> {
  const site = await fetchCompanySite(website);
  const fallback = { description: site.description || site.title, industry: "", location: "" };
  if (!aiConfigured()) return fallback;
  let t = "";
  try { t = await complete({ maxTokens: 400, prompt:
    `From this company's own homepage text, write a factual profile. Use only what the page says; leave a field empty if the page does not say it.\nCompany: ${name}\nTitle: ${site.title}\nMeta description: ${site.description}\nPage text: ${site.text}\n\nReturn only JSON: {"description": "one or two sentences on what they do", "industry": "a few words", "location": "headquarters city and country if stated"}` }); } catch { return fallback; }
  try { const j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); return { description: String(j.description || fallback.description), industry: String(j.industry || ""), location: String(j.location || "") }; }
  catch { return fallback; }
}
