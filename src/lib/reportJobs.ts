import { and, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { bootstrapFor } from "./bootstrapData";
import { runReport, type ReportDef, type ReportResult } from "./reportEngine";
import { sendSystemEmail } from "./mail";
import { appUrl, mailConfigured } from "./config";
import { getState, setState } from "./jobstate";
import { apiFetch, canBackup, getConnection } from "./oauth";
import { announce, chatSettings } from "./chat";
import { appName } from "./brand";

const DRIVE = () => process.env.GOOGLE_DRIVE_API_BASE || "https://www.googleapis.com";
const user = async (id: string) => { const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1); return u && u.status === "active" ? u : null; };
const fmt = (r: ReportResult, v: number) => (r.money ? `$${Math.round(v).toLocaleString("en-US")}` : v.toLocaleString("en-US"));
export const csvOf = (r: ReportResult) => ["Group,Value,Count", ...r.rows.map((x) => `"${x.label.replace(/"/g, '""')}",${Math.round(x.value * 100) / 100},${x.count}`), `"Total",${Math.round(r.total * 100) / 100},${r.count}`].join("\n");
export const textOf = (name: string, r: ReportResult) => [`${name}`, `${r.title} · ${r.periodLabel}`, "", ...(r.rows.length === 1 && r.rows[0].key === "all" ? [] : [...r.rows.map((x) => `${x.label}: ${fmt(r, x.value)}`), ""]), `Total: ${fmt(r, r.total)}`].join("\n");

/** A shared dashboard's live numbers, with the owner's access. Null when the link is off or unknown. */
export async function dashboardData(token: string) {
  const [d] = await db.select().from(schema.dashboards).where(eq(schema.dashboards.token, token)).limit(1);
  if (!d || !d.linkOn) return null;
  const owner = await user(d.ownerId); if (!owner) return null;
  const data = await bootstrapFor(owner);
  const reps = d.reportIds.length ? await db.select().from(schema.reports).where(inArray(schema.reports.id, d.reportIds)) : [];
  const ordered = d.reportIds.map((id) => reps.find((r) => r.id === id)).filter((r): r is typeof reps[number] => !!r && (r.ownerId === owner.id || r.shared));
  return { name: d.name, owner: owner.name || owner.email, generatedAt: Date.now(),
    reports: ordered.map((r) => ({ id: r.id, name: r.name, def: r.def as ReportDef, result: runReport(data, r.def as ReportDef, owner.id) })) };
}

/** Save a report to the owner's Google Drive as a spreadsheet (needs the Drive permission on their connection). */
async function toDrive(userId: string, name: string, csv: string) {
  const conn = await getConnection(userId); if (!conn || !canBackup(conn)) return null;
  const boundary = `lt${Date.now().toString(36)}`;
  const meta = JSON.stringify({ name, mimeType: "application/vnd.google-apps.spreadsheet" });
  const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: text/csv\r\n\r\n`), Buffer.from(csv), Buffer.from(`\r\n--${boundary}--`)]);
  const f = await apiFetch<{ id: string; webViewLink?: string }>(conn, `${DRIVE()}/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink`, { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body });
  return f.webViewLink || `https://docs.google.com/spreadsheets/d/${f.id}`;
}

/** Send a saved report now: email the recipients (with a spreadsheet attached) and, if asked, save it to Drive. */
export async function sendReport(r: typeof schema.reports.$inferSelect, now = new Date()) {
  const owner = await user(r.ownerId); if (!owner || !r.schedule) return false;
  const result = runReport(await bootstrapFor(owner), r.def as ReportDef, owner.id);
  const csv = csvOf(result); const day = new Date().toISOString().slice(0, 10);
  const link = r.schedule.toDrive ? await toDrive(owner.id, `${r.name} ${day}`, csv).catch(() => null) : null;
  if (mailConfigured()) for (const to of r.schedule.recipients)
    await sendSystemEmail({ to, subject: `${r.name} (${result.periodLabel})`, text: `${textOf(r.name, result)}${link ? `\n\nIn Google Drive: ${link}` : ""}\n\nOpen Reports: ${appUrl()}/reports`, attachments: [{ filename: `${r.name.replace(/[^\w -]/g, "")}-${day}.csv`, content: csv, contentType: "text/csv" }] });
  await db.update(schema.reports).set({ lastSentAt: now }).where(eq(schema.reports.id, r.id));
  return true;
}
/** Hourly: send scheduled reports that are due (weekly on their weekday, monthly on the 1st; from 7am UTC). */
export async function runScheduledReports(now = new Date()) {
  const all = await db.select().from(schema.reports);
  let sent = 0;
  for (const r of all) {
    if (!r.schedule || now.getUTCHours() < 7) continue;
    const last = r.lastSentAt; const today = now.toISOString().slice(0, 10);
    const due = r.schedule.freq === "weekly" ? now.getUTCDay() === (r.schedule.weekday ?? 1) && (!last || last.toISOString().slice(0, 10) !== today)
      : now.getUTCDate() === 1 && (!last || last.toISOString().slice(0, 7) !== today.slice(0, 7));
    if (due && await sendReport(r, now).catch((e) => { console.error("report failed", r.id, e); return false; })) sent++;
  }
  return { scheduled: all.filter((r) => r.schedule).length, sent };
}

/** The Monday digest for a manager: per person in their teams, the last 7 days. */
export async function digestFor(manager: typeof schema.users.$inferSelect) {
  const data = await bootstrapFor(manager);
  const since = Date.now() - 7 * 86400_000; const today = new Date().toLocaleDateString("en-CA"); const weekEnd = new Date(Date.now() + 7 * 86400_000).toLocaleDateString("en-CA");
  let people = data.users.filter((u) => u.status === "active" && u.role !== "viewer");
  if (manager.role !== "admin") { const mine = data.teams.map((t) => t.id); people = people.filter((u) => u.id === manager.id || data.teams.some((t) => mine.includes(t.id) && t.memberIds.includes(u.id))); }
  const moves = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.action, "deal.updated"), gte(schema.auditLog.at, new Date(since))));
  const rows = people.map((u) => {
    const acts = data.activities.filter((a) => a.byId === u.id && a.at >= since && !a.preview);
    const myLeads = new Set(data.contacts.filter((c) => c.ownerId === u.id).map((c) => c.id));
    return { name: u.name || u.email,
      touched: new Set(acts.map((a) => a.contactId)).size, emails: acts.filter((a) => a.type === "email").length, calls: acts.filter((a) => a.type === "call").length,
      meetings: acts.filter((a) => a.type === "meeting").length, replies: data.activities.filter((a) => a.type === "reply" && a.at >= since && myLeads.has(a.contactId)).length,
      moved: moves.filter((x) => x.actorId === u.id && Array.isArray((x.detail as { changes?: { field: string }[] })?.changes) && (x.detail as { changes: { field: string }[] }).changes.some((c) => c.field === "stage")).length,
      won: data.deals.filter((d) => d.ownerId === u.id && d.stage === "won" && (d.closedAt || 0) >= since).length,
      invoices: data.billing.filter((b) => b.assigneeId === u.id && b.kind === "invoice" && b.status === "scheduled" && b.dueDate && b.dueDate <= weekEnd).length,
      overdueTasks: data.tasks.filter((t) => t.assigneeId === u.id && !t.done && t.dueDate && t.dueDate < today).length,
      overdueFollowUps: data.contacts.filter((c) => c.ownerId === u.id && c.nextFollowUp && c.nextFollowUp < today && !(c.followupDismissedOn && c.nextFollowUp <= c.followupDismissedOn) && c.status !== "won" && c.status !== "lost").length };
  });
  const line = (r: typeof rows[number]) => `${r.name}: ${r.touched} leads touched, ${r.emails} emails, ${r.calls} calls, ${r.meetings} meetings, ${r.replies} replies, ${r.moved} deals moved${r.won ? `, ${r.won} won` : ""}`
    + `${r.invoices ? `; ${r.invoices} invoice${r.invoices === 1 ? "" : "s"} due this week` : ""}${r.overdueTasks || r.overdueFollowUps ? `; slipping: ${r.overdueTasks} overdue tasks, ${r.overdueFollowUps} overdue follow-ups` : ""}`;
  return { rows, text: [`Weekly digest for ${manager.name || manager.email} (last 7 days)`, "", ...rows.map(line), "", `Open ${appName()}: ${appUrl()}/home`].join("\n") };
}
/** Mondays: each manager and admin gets their digest by email; the team's Google Chat space gets the full one. */
export async function runWeeklyDigest(now = new Date(), force = false) {
  const week = `${now.getUTCFullYear()}-${Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / (7 * 86400_000))}`;
  if (!force && (now.getUTCDay() !== 1 || now.getUTCHours() < 14)) return { skipped: "not Monday morning" };
  if (!force && ((await getState("digest")) as { week?: string } | null)?.week === week) return { skipped: "already sent this week" };
  const managers = await db.select().from(schema.users).where(and(eq(schema.users.status, "active"), inArray(schema.users.role, ["manager", "admin"])));
  let sent = 0; let full = "";
  for (const mgr of managers) {
    const d = await digestFor(mgr);
    if (mgr.role === "admin" && !full) full = d.text;
    if (mailConfigured()) { await sendSystemEmail({ to: mgr.email, subject: "Your weekly team digest", text: d.text }).catch(() => undefined); sent++; }
  }
  const chat = await chatSettings();
  if (full && chat.googleChatUrl && chat.events.weeklyDigest) await announce("weeklyDigest", full).catch(() => undefined);
  await setState("digest", { week, at: Date.now() });
  return { managers: managers.length, emailed: sent, chat: !!(full && chat.googleChatUrl && chat.events.weeklyDigest) };
}
