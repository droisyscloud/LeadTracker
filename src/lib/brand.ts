import { getState } from "./jobstate";

/**
 * Who this installation belongs to. The first values come from server settings (APP_NAME, COMPANY_NAME, ...);
 * an admin can change the company details later in Settings, and those win.
 */
export type Company = { name: string; about: string; address: string; email: string; phone: string; website: string; quoteFooter: string };
type Stored = { companyName?: string; about?: string; postalAddress?: string; email?: string; phone?: string; website?: string; quoteFooter?: string };

const env = (k: string) => (process.env[k] || "").trim();

/** The product's name in the browser tab, emails and the sign-in page. */
export const appName = () => env("APP_NAME") || "Lead Tracker";

export const DEFAULT_COMPANY_NAME = "Your Company";

export async function company(): Promise<Company> {
  const o = (((await getState("org").catch(() => null)) as Stored | null) || {});
  return {
    name: o.companyName || env("COMPANY_NAME") || DEFAULT_COMPANY_NAME,
    about: o.about ?? env("COMPANY_ABOUT"),
    address: o.postalAddress || env("COMPANY_POSTAL_ADDRESS"),
    email: o.email || env("COMPANY_EMAIL") || env("MAIL_FROM_ADDRESS"),
    phone: o.phone || env("COMPANY_PHONE"),
    website: o.website || env("COMPANY_WEBSITE"),
    quoteFooter: o.quoteFooter ?? "Thank you for your business.",
  };
}

/** "Acme Ltd (we sell routing software to hotels)": how AI prompts introduce the sender's company. */
export const who = (c: Company) => (c.about ? `${c.name} (${c.about})` : c.name);

/** Same, with just the name (for places that can't wait for the database). */
export const companyNameFromEnv = () => env("COMPANY_NAME") || DEFAULT_COMPANY_NAME;

/** "Acme Ltd · acme.com": the footer on public pages (booking, unsubscribe). */
export const footerLine = (c: Company) => [c.name, c.website.replace(/^https?:\/\//, "").replace(/\/$/, "")].filter(Boolean).join(" · ");

/* ── Logo: an admin can upload their own (Settings → Company profile). Kept in the database, so it survives redeploys. ── */
export type LogoKind = "logo" | "mark";
export const LOGO_TYPES = ["image/png", "image/jpeg"] as const;   // PNG or JPEG: the quote PDF can embed both
export const MAX_LOGO_BYTES = 512 * 1024;
/** Where pages load the logo from: the uploaded one if there is one, otherwise the default in /public. */
export const logoSrc = (kind: LogoKind = "logo") => `/api/public/brand/${kind}`;
export async function customLogo(kind: LogoKind): Promise<{ type: string; data: Buffer; at: number } | null> {
  const s = (await getState(`brand-${kind}`).catch(() => null)) as { type?: string; data?: string; at?: number } | null;
  return s?.data && s.type ? { type: s.type, data: Buffer.from(s.data, "base64"), at: s.at || 0 } : null;
}
