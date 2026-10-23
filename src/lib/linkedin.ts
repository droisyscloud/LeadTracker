/** A LinkedIn profile address in one clean form, or "" if it isn't one. */
export function cleanLinkedIn(v: string): string {
  const s = (v || "").trim(); if (!s) return "";
  const m = s.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([^/?#\s]+)/i);
  return m ? `https://www.linkedin.com/in/${decodeURIComponent(m[1]).replace(/[^\w\-.%]/g, "")}` : "";
}
