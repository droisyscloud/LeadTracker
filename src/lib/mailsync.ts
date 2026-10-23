import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { RateLimitError, apiFetch, type Conn } from "./oauth";
import { recordTouch } from "./touch";
import { appUrl } from "./config";
import { addNotifications } from "./notify";
import { announce } from "./chat";
import { decodeEntities } from "./text";
export { decodeEntities };

/**
 * Mailbox sync. Only emails to or from people already in the app are read. Those are saved in full:
 * sender, recipients, subject, the text and HTML body, and a list of attachments (the files themselves are
 * fetched from the mailbox the first time someone opens them).
 */
export type MailAttachment = { partRef: string; name: string; contentType: string; size: number };
export type Msg = { names?: Record<string, string>; id: string; providerId: string; from: string; to: string[]; cc: string[]; subject: string; text: string; html: string | null; attachments: MailAttachment[]; at: Date; sent: boolean };

export const GMAIL = () => process.env.GMAIL_API_BASE || "https://gmail.googleapis.com";
export const GRAPH = () => process.env.GRAPH_API_BASE || "https://graph.microsoft.com";
const MAX_TEXT = 200_000, MAX_HTML = 1_000_000;
const addrs = (v: string) => (v.match(/[^\s<>,;"]+@[^\s<>,;"]+/g) || []).map((x) => x.toLowerCase());

/** Plain-text version of an HTML email for search, previews and the AI. */
export function htmlToText(html: string): string {
  return html.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------- Gmail ----------
type GPart = { partId?: string; mimeType?: string; filename?: string; headers?: { name: string; value: string }[]; body?: { size?: number; data?: string; attachmentId?: string }; parts?: GPart[] };
type GMsg = { id: string; internalDate: string; labelIds?: string[]; snippet?: string; payload?: GPart };
function decodePart(p: GPart): string {
  if (!p.body?.data) return "";
  const charset = (p.headers?.find((h) => h.name.toLowerCase() === "content-type")?.value.match(/charset="?([\w-]+)"?/i)?.[1] || "utf-8").toLowerCase();
  const bytes = Buffer.from(p.body.data, "base64url");
  try { return new TextDecoder(charset).decode(bytes); } catch { return bytes.toString("utf8"); }
}
/** Display names from address headers: "Dana Smith <dana@acme.example>, ..." → { "dana@acme.example": "Dana Smith" }. */
function headerNames(v: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of v.matchAll(/"?([^",<]+?)"?\s*<([^>]+@[^>]+)>/g)) { const n = m[1].trim(); const e = m[2].trim().toLowerCase(); if (n && !n.includes("@")) out[e] = n; }
  return out;
}
export function parseGmail(m: GMsg): Msg {
  const top = m.payload || {};
  const h = (n: string) => top.headers?.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value || "";
  let text = "", html = "";
  const attachments: MailAttachment[] = [];
  const walk = (p: GPart) => {
    const mt = (p.mimeType || "").toLowerCase();
    const disp = (p.headers?.find((x) => x.name.toLowerCase() === "content-disposition")?.value || "").toLowerCase();
    const cid = p.headers?.some((x) => x.name.toLowerCase() === "content-id");
    if (p.filename && (p.body?.attachmentId || p.body?.data) && !(cid && disp.startsWith("inline") && mt.startsWith("image/"))) {
      attachments.push({ partRef: p.partId || p.filename, name: p.filename, contentType: mt || "application/octet-stream", size: p.body?.size || 0 });
    } else if (mt === "text/plain" && !text && !disp.startsWith("attachment")) text = decodePart(p);
    else if (mt === "text/html" && !html && !disp.startsWith("attachment")) html = decodePart(p);
    for (const c of p.parts || []) walk(c);
  };
  walk(top);
  if (!text && html) text = htmlToText(html);
  return {
    names: headerNames([h("From"), h("To"), h("Cc")].join(", ")), id: h("Message-ID") || `gmail:${m.id}`, providerId: m.id, from: addrs(h("From"))[0] || "", to: addrs(h("To")), cc: addrs(h("Cc")), subject: h("Subject"),
    text: (text || m.snippet || "").slice(0, MAX_TEXT), html: html ? html.slice(0, MAX_HTML) : null, attachments,
    at: new Date(Number(m.internalDate)), sent: (m.labelIds || []).includes("SENT"),
  };
}
async function gmailIds(c: Conn, since: Date, emails: string[], cap: number): Promise<string[]> {
  const after = Math.floor(since.getTime() / 1000);
  const ids = new Set<string>();
  for (let i = 0; i < emails.length && ids.size < cap; i += 25) {
    const group = emails.slice(i, i + 25).join(" OR ");
    const q = encodeURIComponent(`after:${after} {from:(${group}) to:(${group}) cc:(${group})} -in:chats`);
    let page: string | undefined;
    do {
      const list = await apiFetch<{ messages?: { id: string }[]; nextPageToken?: string }>(c, `${GMAIL()}/gmail/v1/users/me/messages?q=${q}&maxResults=100${page ? `&pageToken=${page}` : ""}`);
      for (const m of list.messages || []) ids.add(m.id);
      page = list.nextPageToken;
    } while (page && ids.size < cap);
  }
  return [...ids].slice(0, cap);
}
async function gmailMessages(c: Conn, since: Date, emails: string[], cap: number): Promise<Msg[]> {
  const out: Msg[] = [];
  for (const id of await gmailIds(c, since, emails, cap)) {
    out.push(parseGmail(await apiFetch<GMsg>(c, `${GMAIL()}/gmail/v1/users/me/messages/${id}?format=full`)));
    await new Promise((r) => setTimeout(r, 120));
  }
  return out;
}

// ---------- Microsoft 365 ----------
type GAddr = { emailAddress?: { address?: string } };
async function graphMessages(c: Conn, since: Date, cap: number): Promise<Msg[]> {
  const out: Msg[] = [];
  for (const folder of ["inbox", "sentitems"]) {
    let url: string | null = `${GRAPH()}/v1.0/me/mailFolders/${folder}/messages?$filter=${encodeURIComponent(`receivedDateTime ge ${since.toISOString()}`)}&$select=id,internetMessageId,from,toRecipients,ccRecipients,subject,body,bodyPreview,hasAttachments,receivedDateTime,sentDateTime&$top=25&$orderby=receivedDateTime desc`;
    let pages = 0;
    while (url && pages++ < 10 && out.length < cap) {
      type G = { value: { id: string; internetMessageId: string; from?: GAddr; toRecipients?: GAddr[]; ccRecipients?: GAddr[]; subject?: string; body?: { contentType?: string; content?: string }; bodyPreview?: string; hasAttachments?: boolean; receivedDateTime: string; sentDateTime?: string }[]; "@odata.nextLink"?: string };
      const r: G = await apiFetch<G>(c, url);
      for (const m of r.value) {
        const isHtml = (m.body?.contentType || "").toLowerCase() === "html";
        const html = isHtml ? m.body?.content || "" : null;
        out.push({
          id: m.internetMessageId, providerId: m.id, from: (m.from?.emailAddress?.address || "").toLowerCase(),
          to: (m.toRecipients || []).map((x) => (x.emailAddress?.address || "").toLowerCase()).filter(Boolean),
          cc: (m.ccRecipients || []).map((x) => (x.emailAddress?.address || "").toLowerCase()).filter(Boolean),
          subject: m.subject || "", text: (html ? htmlToText(html) : m.body?.content || m.bodyPreview || "").slice(0, MAX_TEXT), html: html ? html.slice(0, MAX_HTML) : null,
          attachments: m.hasAttachments ? [{ partRef: "__pending__", name: "", contentType: "", size: 0 }] : [],
          at: new Date(m.sentDateTime || m.receivedDateTime), sent: folder === "sentitems",
        });
      }
      url = r["@odata.nextLink"] || null;
    }
  }
  return out;
}
async function graphAttachments(c: Conn, messageId: string): Promise<MailAttachment[]> {
  const r = await apiFetch<{ value: { id: string; name?: string; contentType?: string; size?: number; isInline?: boolean }[] }>(c, `${GRAPH()}/v1.0/me/messages/${messageId}/attachments?$select=id,name,contentType,size,isInline`);
  return r.value.filter((a) => !a.isInline).map((a) => ({ partRef: a.id, name: a.name || "attachment", contentType: a.contentType || "application/octet-stream", size: a.size || 0 }));
}

/** Download one attachment from the mailbox it came from. */
export async function fetchAttachment(c: Conn, providerMessageId: string, partRef: string): Promise<Buffer> {
  if (c.provider === "microsoft") {
    const r = await apiFetch<{ contentBytes?: string }>(c, `${GRAPH()}/v1.0/me/messages/${providerMessageId}/attachments/${partRef}`);
    return Buffer.from(r.contentBytes || "", "base64");
  }
  // Gmail attachment ids change between requests, so look the part up again by its stable part number
  const m = await apiFetch<GMsg>(c, `${GMAIL()}/gmail/v1/users/me/messages/${providerMessageId}?format=full`);
  let found: GPart | undefined;
  const walk = (p: GPart) => { if ((p.partId || p.filename) === partRef) found = p; for (const x of p.parts || []) walk(x); };
  if (m.payload) walk(m.payload);
  if (!found) throw new Error("Attachment no longer in the mailbox");
  if (found.body?.data) return Buffer.from(found.body.data, "base64url");
  const a = await apiFetch<{ data: string }>(c, `${GMAIL()}/gmail/v1/users/me/messages/${providerMessageId}/attachments/${found.body?.attachmentId}`);
  return Buffer.from(a.data, "base64url");
}

/**
 * Pull recent mail for one connected person and log anything exchanged with known contacts.
 * `refresh` re-reads an earlier period and fills in full details on emails that were saved as previews before.
 */
export async function syncMailbox(c: Conn, opts: { since?: Date; refresh?: boolean } = {}): Promise<{ logged: number; updated: number }> {
  const since = opts.since || (c.lastSyncAt ? new Date(c.lastSyncAt.getTime() - 10 * 60_000) : new Date(Date.now() - 14 * 86400_000));
  const started = new Date();
  try {
    const contacts = (await db.select({ id: schema.contacts.id, email: schema.contacts.email, otherEmails: schema.contacts.otherEmails, personal: schema.contacts.personal, createdById: schema.contacts.createdById }).from(schema.contacts)).filter((x) => !x.personal || x.createdById === c.userId);   // personal contacts: only in their owner's mailbox
    const byEmail = new Map(contacts.flatMap((x) => [x.email, ...(x.otherEmails || [])].filter(Boolean).map((e) => [e.toLowerCase().trim(), x.id] as [string, string])));
    const doms = await companyDomains(c.email);
    const found = new Map<string, number>();
    if (!byEmail.size) {
      await db.update(schema.connections).set({ lastSyncAt: started, status: "ok", lastError: null }).where(eq(schema.connections.userId, c.userId));
      return { logged: 0, updated: 0 };
    }
    const cap = opts.refresh ? 500 : 300;
    const msgs = c.provider === "microsoft" ? await graphMessages(c, since, cap) : await gmailMessages(c, since, [...new Set([...byEmail.keys(), ...doms.keys()])], cap);
    let logged = 0, updated = 0;
    for (const m of msgs.sort((a, b) => a.at.getTime() - b.at.getTime())) {
      // only the people the email is really between: who sent it and who it was sent To. People who are only in Cc
      // don't get it on their timeline (one email to 15 people would otherwise show on all 15).
      const me = c.email.toLowerCase();
      const targets = (m.sent ? [...m.to] : [m.from, ...m.to]).filter((e) => e && e.toLowerCase() !== me).map((e) => byEmail.get(e.toLowerCase())).filter(Boolean) as string[];
      await suggestPeople(c, m, byEmail, doms, found);
      if (!targets.length) continue;
      let atts = m.attachments;
      if (c.provider === "microsoft" && atts.length && atts[0].partRef === "__pending__") atts = await graphAttachments(c, m.providerId).catch(() => []);
      for (const contactId of new Set(targets)) {
        const type = m.sent ? "email" : "reply";
        const full = { subject: m.subject, body: m.text, bodyHtml: m.html, emailFrom: m.from, emailTo: m.to, emailCc: m.cc, mailboxUserId: c.userId, providerMessageId: m.providerId };
        const externalId = `${m.id}#${contactId}`;
        const [ins] = await db.insert(schema.activities).values({ contactId, type, ...full, byId: c.userId, at: m.at, origin: "sync", externalId, delivery: m.sent ? "sent" : null })
          .onConflictDoNothing().returning({ id: schema.activities.id });
        let activityId = ins?.id;
        if (ins) {
          // on received mail only the sender replied; others in To or Cc just get the email on their timeline
          const isSender = m.sent || byEmail.get((m.from || "").toLowerCase()) === contactId;
          logged++; if (isSender) await recordTouch(contactId, type, { byId: c.userId, at: m.at });
          // a lead wrote back: tell their owner (and the mailbox owner, if different), unless it's old mail being filled in
          if (isSender && type === "reply" && Date.now() - m.at.getTime() < 3 * 86400_000) {
            const [lead] = await db.select({ name: schema.contacts.name, ownerId: schema.contacts.ownerId, rating: schema.contacts.rating }).from(schema.contacts).where(eq(schema.contacts.id, contactId)).limit(1);
            if (lead) {
              const to = [...new Set([lead.ownerId || c.userId, c.userId])];
              // only the person whose mailbox received it sees the subject; everyone else just sees that they replied
              await addNotifications(to.map((userId) => ({ userId, kind: "reply" as const, text: `${lead.name} replied${userId === c.userId && m.subject ? `: ${m.subject}` : ""}`, link: `/contacts?id=${contactId}` })));
              if (lead.rating >= 4) await announce("hotReply", `🔥 ${lead.name} (a hot lead) replied. ${appUrl()}/contacts?id=${contactId}`);
            }
          }
        }
        else {
          // already logged: an email sent from the app, or an older preview-only copy. Fill in what's missing.
          const [ex] = await db.select().from(schema.activities).where(eq(schema.activities.externalId, externalId)).limit(1);
          if (!ex) continue;
          activityId = ex.id;
          const needs = !ex.providerMessageId || (opts.refresh && ex.origin === "sync");
          if (needs) {
            await db.update(schema.activities).set(ex.origin === "sync" ? full : { emailFrom: ex.emailFrom || m.from, emailTo: ex.emailTo.length ? ex.emailTo : m.to, emailCc: ex.emailCc.length ? ex.emailCc : m.cc, bodyHtml: ex.bodyHtml || m.html, mailboxUserId: c.userId, providerMessageId: m.providerId })
              .where(eq(schema.activities.id, ex.id));
            updated++;
          }
        }
        if (activityId && atts.length) {
          await db.insert(schema.emailAttachments).values(atts.map((a) => ({ activityId: activityId!, name: a.name, contentType: a.contentType, size: a.size, partRef: a.partRef }))).onConflictDoNothing();
        }
      }
    }
    await db.update(schema.connections).set({ lastSyncAt: opts.refresh && c.lastSyncAt && c.lastSyncAt > started ? c.lastSyncAt : started, status: "ok", lastError: null }).where(eq(schema.connections.userId, c.userId));
    await announceSuggestions(c, found).catch(() => undefined);
    return { logged, updated };
  } catch (e) {
    if (e instanceof RateLimitError) {
      await db.update(schema.connections).set({ status: "ok", lastError: "rate-limited" }).where(eq(schema.connections.userId, c.userId));
      return { logged: 0, updated: 0 };
    }
    const msg = e instanceof Error ? e.message : String(e);
    await db.update(schema.connections).set({ status: "error", lastError: msg.slice(0, 500) }).where(eq(schema.connections.userId, c.userId));
    throw e;
  }
}

type Act = typeof schema.activities.$inferSelect;
/**
 * Older synced emails were saved as a short preview. Find the exact original in the mailbox by its Message-ID
 * and fill in the full text, formatting, recipients and attachments. Returns false if it can't be found.
 */
export async function upgradePreview(a: Act, c: Conn): Promise<boolean> {
  const mid = (a.externalId || "").split("#")[0];
  if (!mid) return false;
  let msg: Msg | null = null;
  if (c.provider === "google") {
    let gid = mid.startsWith("gmail:") ? mid.slice(6) : "";
    if (!gid) {
      const r = await apiFetch<{ messages?: { id: string }[] }>(c, `${GMAIL()}/gmail/v1/users/me/messages?q=${encodeURIComponent(`rfc822msgid:${mid.replace(/^<|>$/g, "")}`)}&includeSpamTrash=true&maxResults=1`);
      gid = r.messages?.[0]?.id || "";
    }
    if (gid) msg = parseGmail(await apiFetch<GMsg>(c, `${GMAIL()}/gmail/v1/users/me/messages/${gid}?format=full`));
  } else {
    type G = { value: { id: string; internetMessageId: string; from?: GAddr; toRecipients?: GAddr[]; ccRecipients?: GAddr[]; subject?: string; body?: { contentType?: string; content?: string }; hasAttachments?: boolean; sentDateTime?: string; receivedDateTime: string }[] };
    const r = await apiFetch<G>(c, `${GRAPH()}/v1.0/me/messages?$filter=${encodeURIComponent(`internetMessageId eq '${mid.replace(/'/g, "''")}'`)}&$select=id,internetMessageId,from,toRecipients,ccRecipients,subject,body,hasAttachments,sentDateTime,receivedDateTime&$top=1`);
    const m = r.value[0];
    if (m) {
      const html = (m.body?.contentType || "").toLowerCase() === "html" ? m.body?.content || "" : null;
      msg = { id: m.internetMessageId, providerId: m.id, from: (m.from?.emailAddress?.address || "").toLowerCase(), to: (m.toRecipients || []).map((x) => (x.emailAddress?.address || "").toLowerCase()).filter(Boolean),
        cc: (m.ccRecipients || []).map((x) => (x.emailAddress?.address || "").toLowerCase()).filter(Boolean), subject: m.subject || "", text: html ? htmlToText(html) : m.body?.content || "", html,
        attachments: m.hasAttachments ? await graphAttachments(c, m.id).catch(() => []) : [], at: new Date(m.sentDateTime || m.receivedDateTime), sent: false };
    }
  }
  if (!msg) {
    // gone from the mailbox: remember that so we don't keep asking, and show the preview we have
    await db.update(schema.activities).set({ providerMessageId: "missing", body: decodeEntities(a.body) }).where(eq(schema.activities.id, a.id));
    return false;
  }
  await db.update(schema.activities).set({ subject: msg.subject || a.subject, body: msg.text, bodyHtml: msg.html, emailFrom: msg.from, emailTo: msg.to, emailCc: msg.cc, mailboxUserId: c.userId, providerMessageId: msg.providerId })
    .where(eq(schema.activities.id, a.id));
  if (msg.attachments.length) await db.insert(schema.emailAttachments).values(msg.attachments.map((x) => ({ activityId: a.id, name: x.name, contentType: x.contentType, size: x.size, partRef: x.partRef }))).onConflictDoNothing();
  return true;
}

/** Background clean-up: upgrade a batch of preview-only emails from this person's mailbox on each sync run. */
export async function upgradePreviews(c: Conn, limit = 40): Promise<number> {
  const rows = await db.select().from(schema.activities).where(and(eq(schema.activities.origin, "sync"), isNull(schema.activities.providerMessageId), eq(schema.activities.byId, c.userId))).limit(limit);
  let n = 0;
  for (const a of rows) {
    try { if (await upgradePreview(a, c)) n++; }
    catch (e) { if (e instanceof RateLimitError) break; console.error("preview upgrade failed", a.id, e); }
    await new Promise((r) => setTimeout(r, 150));
  }
  return n;
}

/* ── New people at saved companies (suggested contacts) ── */
const FREE = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "ymail.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "zoho.com", "yandex.com", "mail.com"]);
const AUTO = /^(no-?reply|do-?not-?reply|notifications?|mailer-daemon|postmaster|bounce|billing|invoices?|accounts?-?payable|alerts?|calendar|news(letter)?|marketing|support|help|info)([+.-].*)?@/;
const domainOf = (e: string) => e.split("@")[1]?.toLowerCase() || "";
/** Company by email domain: from each company's website, and the domains its contacts already use. */
async function companyDomains(myEmail: string) {
  const own = domainOf(myEmail); const skip = new Set([own, domainOf(process.env.MAIL_FROM_ADDRESS || "")]);
  const [cos, cts] = await Promise.all([db.select({ id: schema.companies.id, website: schema.companies.website }).from(schema.companies), db.select({ email: schema.contacts.email, companyId: schema.contacts.companyId }).from(schema.contacts)]);
  const map = new Map<string, string>(); const clash = new Set<string>();
  const put = (d: string, id: string) => { if (!d || FREE.has(d) || skip.has(d)) return; if (map.has(d) && map.get(d) !== id) clash.add(d); else map.set(d, id); };
  for (const c of cos) { const w = (c.website || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0]; if (w.includes(".")) put(w, c.id); }
  for (const c of cts) if (c.email && c.companyId) put(domainOf(c.email), c.companyId);
  for (const d of clash) map.delete(d);
  return map;
}
async function suggestPeople(c: Conn, m: Msg, known: Map<string, string>, doms: Map<string, string>, found: Map<string, number>) {
  if (!doms.size) return;
  for (const e of new Set([m.from, ...m.to, ...m.cc].map((x) => (x || "").toLowerCase()).filter(Boolean))) {
    if (e === c.email.toLowerCase() || AUTO.test(e)) continue;
    const companyId = known.has(e) ? undefined : doms.get(domainOf(e)); if (!companyId) continue;
    const name = m.names?.[e] || ""; const [cur] = await db.select().from(schema.contactSuggestions).where(eq(schema.contactSuggestions.email, e)).limit(1);
    if (!cur) { await db.insert(schema.contactSuggestions).values({ email: e, name, companyId, mailboxUserId: c.userId, lastSubject: m.subject.slice(0, 200), lastAt: m.at }).onConflictDoNothing();
      found.set(companyId, (found.get(companyId) || 0) + 1); }
    else if (cur.status === "new" && m.at.getTime() > cur.lastAt.getTime()) await db.update(schema.contactSuggestions).set({ emails: cur.emails + 1, lastSubject: m.subject.slice(0, 200), lastAt: m.at, name: cur.name || name }).where(eq(schema.contactSuggestions.id, cur.id));
  }
}
export async function announceSuggestions(c: Conn, found: Map<string, number>) {
  for (const [id, n] of found) {
    const [co] = await db.select({ name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, id)).limit(1);
    await addNotifications([{ userId: c.userId, kind: "reply" as const, text: `${n} new ${n === 1 ? "person" : "people"} from ${co?.name || "a company"} found in your emails. Add them as contacts?`, link: `/companies?id=${id}` }]); }
}
