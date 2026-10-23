import type { Role } from "@/db/schema";
import { getState, setState } from "./jobstate";
import { HttpError } from "./http";

/**
 * Finer permissions on top of roles: per role, an admin decides who can export, delete, see deal values and
 * money, and see billing and contracts. Admins can always do everything. Checked on the server.
 */
export type Cap = "export" | "delete" | "money" | "billing";
export const CAPS: [Cap, string, string][] = [
  ["export", "Export data", "Download everything as a spreadsheet"],
  ["delete", "Delete things", "Delete leads, deals, timeline entries and companies (they go to the recycle bin)"],
  ["money", "See deal values and money", "Deal values, pipeline, payments and revenue in reports. When off, amounts aren't sent to their device at all"],
  ["billing", "See billing and contracts", "The Billing and contracts page, SOWs, invoices and payments on deals"],
];
export type PermRole = "manager" | "rep" | "viewer";
export type PermSettings = Record<PermRole, Record<Cap, boolean>>;
export const PERM_DEFAULTS: PermSettings = {
  manager: { export: true, delete: true, money: true, billing: true },
  rep: { export: false, delete: true, money: true, billing: true },
  viewer: { export: false, delete: false, money: true, billing: true },
};
export async function permSettings(): Promise<PermSettings> {
  const s = (await getState("permissions")) as Partial<PermSettings> | null;
  return { manager: { ...PERM_DEFAULTS.manager, ...(s?.manager || {}) }, rep: { ...PERM_DEFAULTS.rep, ...(s?.rep || {}) }, viewer: { ...PERM_DEFAULTS.viewer, ...(s?.viewer || {}) } };
}
export async function savePermSettings(p: PermSettings) { await setState("permissions", p as unknown as Record<string, unknown>); }
export async function capsFor(role: Role): Promise<Record<Cap, boolean>> {
  if (role === "admin") return { export: true, delete: true, money: true, billing: true };
  return (await permSettings())[role as PermRole];
}
const MSG: Record<Cap, string> = { export: "Your role isn't allowed to export data.", delete: "Your role isn't allowed to delete things.", money: "Your role isn't allowed to see deal values.", billing: "Your role isn't allowed to see billing and contracts." };
export async function requireCap(me: { role: Role }, cap: Cap) { if (!(await capsFor(me.role))[cap]) throw new HttpError(403, MSG[cap]); }
