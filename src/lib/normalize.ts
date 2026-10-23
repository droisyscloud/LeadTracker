/** Company matching key: "J  J Gaming", "Jj Gaming" and "J&J Gaming" all become "jjgaming". */
export function companyKey(name: string): string {
  const k = String(name || "").toLowerCase().replace(/&|\band\b/g, "").replace(/[^a-z0-9]/g, "")
    .replace(/(gmbh|ltd|limited|inc|llc|corp|corporation|co)$/, "");
  return k || "unknown";
}
export function cleanWebsite(w: string | null | undefined): string {
  const v = String(w || "").trim();
  if (!v) return "";
  return v.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}
export function cleanEmail(e: string | null | undefined): string { return String(e || "").trim().toLowerCase(); }
const FREE_MAIL = /(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|aol|proton|protonmail|email|mail|gmx)\.[a-z.]+$/i;
export function websiteFromEmail(email: string): string {
  const d = cleanEmail(email).split("@")[1];
  return d && !FREE_MAIL.test(d) ? d : "";
}
export function titleCase(t: string): string {
  let s = String(t || "").trim().replace(/\s+/g, " ");
  if (!s) return s;
  // all lower or ALL CAPS ("vp sales", "DIRECTOR OF OPERATIONS") -> Title Case; mixed case is left as typed
  if (s === s.toLowerCase() || s === s.toUpperCase()) s = s.toLowerCase().replace(/(^|[\s/&(-])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
  return s.replace(/\b(Ceo|Coo|Cfo|Cto|Cmo|Cpo|Cio|Cro|Vp|Svp|Evp|Avp|Gm|Hr|It|Usa|Uk|Uae|Ai|Ui|Ux|Qa)\b/g, (m) => m.toUpperCase())
    .replace(/ (Of|And|The|For|To|In|At|On)\b/g, (m) => m.toLowerCase());
}
