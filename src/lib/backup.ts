import ExcelJS from "exceljs";
import { db, schema } from "@/db";
import { isEmail, redactEmail } from "./emailPrivacy";
import { getState, setState } from "./jobstate";
import { apiFetch, canBackup, getConnection } from "./oauth";
import { practiceMode } from "./config";
import { appName } from "./brand";

/**
 * Weekly backup to Google Drive: one spreadsheet with every lead, company, deal, activity and task,
 * saved in a "<app name> backups" folder in the Drive of the admin who set it up.
 * The app's Drive permission (drive.file) only reaches files it created, so it can't read anything else.
 */
export type BackupSettings = { enabled: boolean; ownerUserId: string | null; keep: number; folderId: string | null; lastAt: number | null; lastLink: string | null; lastName: string | null; lastError: string | null };
const DEFAULTS: BackupSettings = { enabled: false, ownerUserId: null, keep: 12, folderId: null, lastAt: null, lastLink: null, lastName: null, lastError: null };
const DRIVE = () => process.env.GOOGLE_DRIVE_API_BASE || "https://www.googleapis.com";
const WEEK = 7 * 86400_000;

export type Scope = "sales";
const KEY: Record<Scope, string> = { sales: "backup" };
const FOLDER = (): Record<Scope, string> => ({ sales: `${appName()} backups` });
export async function backupSettings(scope: Scope = "sales"): Promise<BackupSettings> { return { ...DEFAULTS, ...((await getState(KEY[scope])) as Partial<BackupSettings> | null || {}) }; }
export async function saveBackupSettings(s: BackupSettings, scope: Scope = "sales") { await setState(KEY[scope], s as unknown as Record<string, unknown>); }

const d = (x: Date | null | undefined) => (x ? x.toISOString().replace("T", " ").slice(0, 16) : "");
/** Build the spreadsheet in memory. */
export async function buildWorkbook(scope: Scope = "sales"): Promise<Buffer> {
  const [users, companies, contacts, cps, products, deals, acts, tasks, events, teams] = await Promise.all([
    db.select().from(schema.users), db.select().from(schema.companies), db.select().from(schema.contacts), db.select().from(schema.contactProducts),
    db.select().from(schema.products), db.select().from(schema.deals), db.select().from(schema.activities), db.select().from(schema.tasks),
    db.select().from(schema.events), db.select().from(schema.teams),
  ]);
  // the backup never contains email content: only that an email was sent or received (unless its owner shared it)
  const actsSafe = acts.map((a) => (isEmail(a) && !a.shared ? redactEmail(a) : a));
  const U = new Map(users.map((u) => [u.id, u.name || u.email])), CO = new Map(companies.map((c) => [c.id, c.name])), C = new Map(contacts.map((c) => [c.id, c.name]));
  const P = new Map(products.map((p) => [p.id, p.name])), E = new Map(events.map((e) => [e.id, e.name])), T = new Map(teams.map((t) => [t.id, t.name]));
  const prods = new Map<string, string[]>(); for (const x of cps) prods.set(x.contactId, [...(prods.get(x.contactId) || []), P.get(x.productId) || ""]);
  const wb = new ExcelJS.Workbook(); wb.creator = appName(); wb.created = new Date();
  const sheet = (name: string, cols: [string, number][], rows: (string | number | null)[][]) => {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = cols.map(([header, width]) => ({ header, width }));
    ws.getRow(1).font = { bold: true }; ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF9" } };
    for (const r of rows) ws.addRow(r.map((v) => (typeof v === "string" ? v.slice(0, 32000) : v)));
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  };
  if (scope === "sales") {
  sheet("Leads", [["Name", 24], ["Title", 22], ["Company", 24], ["Email", 28], ["Phone", 16], ["Stage", 12], ["Rating", 8], ["Owner", 18], ["Team", 16], ["Products", 22], ["Event", 18], ["Source", 14], ["Tags", 24], ["Next follow-up", 14], ["Last touch", 17], ["Added", 17], ["Unsubscribed", 17]],
    contacts.map((c) => [c.name, c.title, c.companyId ? CO.get(c.companyId) || "" : "", c.email, c.phone, c.status, c.rating, c.ownerId ? U.get(c.ownerId) || "" : "", c.teamId ? T.get(c.teamId) || "" : "",
      (prods.get(c.id) || []).join(", "), c.eventId ? E.get(c.eventId) || "" : "", c.source, c.tags.join(", "), c.nextFollowUp || "", d(c.lastTouchAt), d(c.createdAt), d(c.unsubscribedAt)]));
  sheet("Companies", [["Name", 28], ["Website", 26], ["Industry", 20], ["Location", 20], ["People", 8], ["Notes", 40]],
    companies.map((c) => [c.name, c.website, c.industry, c.location, contacts.filter((x) => x.companyId === c.id).length, c.notes]));
  sheet("Deals", [["Deal", 28], ["Company", 24], ["Contact", 20], ["Stage", 12], ["Value", 12], ["Currency", 8], ["Probability %", 12], ["Close date", 12], ["Owner", 18], ["Team", 16], ["Won/lost reason", 22]],
    deals.map((x) => [x.name, x.companyId ? CO.get(x.companyId) || "" : "", x.contactId ? C.get(x.contactId) || "" : "", x.stage, x.value, x.currency, x.probability, x.closeDate || "", x.ownerId ? U.get(x.ownerId) || "" : "", x.teamId ? T.get(x.teamId) || "" : "", x.outcomeReason || ""]));
  sheet("Activity", [["When", 17], ["Lead", 22], ["Type", 10], ["Subject", 30], ["Details", 60], ["By", 18]],
    [...acts].sort((a, b) => b.at.getTime() - a.at.getTime()).map((a) => [d(a.at), C.get(a.contactId) || "", a.type, a.subject, a.body, a.byId ? U.get(a.byId) || "" : ""]));
  sheet("Tasks", [["Task", 32], ["Status", 12], ["Priority", 10], ["Due", 12], ["Assigned to", 18], ["Lead", 20], ["Details", 40]],
    tasks.map((t) => [t.title, t.status, t.priority, t.dueDate || "", t.assigneeId ? U.get(t.assigneeId) || "" : "", t.contactId ? C.get(t.contactId) || "" : "", t.notes]));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function ensureFolder(conn: Awaited<ReturnType<typeof getConnection>> & object, s: BackupSettings, scope: Scope = "sales") {
  if (s.folderId) {
    const ok = await apiFetch<{ id: string; trashed?: boolean }>(conn, `${DRIVE()}/drive/v3/files/${s.folderId}?fields=id,trashed`).then((f) => !f.trashed).catch(() => false);
    if (ok) return s.folderId;
  }
  const f = await apiFetch<{ id: string }>(conn, `${DRIVE()}/drive/v3/files?fields=id`, { method: "POST", body: JSON.stringify({ name: FOLDER()[scope], mimeType: "application/vnd.google-apps.folder" }) });
  return f.id;
}

/** Make and upload a backup now, then remove the oldest beyond the number to keep. */
export async function runBackup(scope: Scope = "sales"): Promise<BackupSettings> {
  if (practiceMode()) { console.log("[practice] not sent: runBackup"); throw new Error("Backups are switched off in the practice space."); }
  const s = await backupSettings(scope);
  if (!s.ownerUserId) throw new Error("Backups aren't set up yet.");
  const conn = await getConnection(s.ownerUserId);
  if (!conn || !canBackup(conn)) { const e = "The backup owner's Google account isn't connected with Drive access. Reconnect it on the Account page."; await saveBackupSettings({ ...s, lastError: e }, scope); throw new Error(e); }
  try {
    const folderId = await ensureFolder(conn, s, scope);
    const xlsx = await buildWorkbook(scope);
    const name = `${appName()} backup ${new Date().toISOString().slice(0, 10)}.xlsx`;
    const boundary = `lt${Date.now().toString(36)}`;
    const meta = JSON.stringify({ name, parents: [folderId], mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`), xlsx, Buffer.from(`\r\n--${boundary}--`)]);
    const f = await apiFetch<{ id: string; webViewLink?: string }>(conn, `${DRIVE()}/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink`, { method: "POST", body, headers: { "Content-Type": `multipart/related; boundary=${boundary}` } });
    // keep the newest N
    const list = await apiFetch<{ files: { id: string }[] }>(conn, `${DRIVE()}/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed=false and mimeType != 'application/vnd.google-apps.folder'`)}&orderBy=createdTime desc&fields=files(id)&pageSize=200`).catch(() => ({ files: [] }));
    for (const old of list.files.slice(s.keep)) await apiFetch(conn, `${DRIVE()}/drive/v3/files/${old.id}`, { method: "DELETE" }).catch(() => undefined);
    const copied = 0;
    const next = { ...s, folderId, lastAt: Date.now(), lastLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`, lastName: name, lastError: copied < 0 ? "The spreadsheet was saved, but some uploaded files couldn't be copied. It will try again next time." : null };
    await saveBackupSettings(next, scope);
    return next;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await saveBackupSettings({ ...s, lastError: msg.slice(0, 300) }, scope);
    throw e;
  }
}

/** Called by the scheduled jobs: back up once a week when switched on. */
export async function weeklyBackup() {
  const s = await backupSettings();
  if (!s.enabled || !s.ownerUserId) return { skipped: "off" };
  if (s.lastAt && Date.now() - s.lastAt < WEEK - 3600_000) return { skipped: "not due" };
  try { const r = await runBackup(); return { backedUp: r.lastName }; } catch (e) { return { error: e instanceof Error ? e.message : "failed" }; }
}
