import { eq } from "drizzle-orm";
// nodemailer's composer builds a standard MIME message (text, HTML, attachments) that Gmail and Outlook accept as-is
import MailComposer from "nodemailer/lib/mail-composer";
import { db, schema } from "@/db";
import { appUrl, mailConfigured } from "./config";
import { HttpError } from "./http";
import { apiFetch, canSendMail, type Conn } from "./oauth";
import { sendFollowUp } from "./mail";
import { practiceMode } from "./config";

export type SendVia = "gmail" | "outlook" | "smtp";
type Opts = { to: string; subject: string; text: string; trackToken?: string | null; attachments?: { filename: string; content: Buffer; contentType: string }[]; headers?: Record<string, string> };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const toHtml = (t: string) => esc(t).replace(/\n/g, "<br>");

export async function senderConnection(userId: string): Promise<Conn | null> {
  const [c] = await db.select().from(schema.connections).where(eq(schema.connections.userId, userId)).limit(1);
  return c && canSendMail(c) ? c : null;
}

/** How this person's emails would go out right now, for the compose screen. */
export async function sendRoute(userId: string): Promise<SendVia | null> {
  const c = await senderConnection(userId);
  if (c) return c.provider === "google" ? "gmail" : "outlook";
  return mailConfigured() ? "smtp" : null;
}

/**
 * Send a follow-up as the person: through their own Gmail or Outlook when connected (so it sits in their Sent folder
 * and replies come back to their inbox), otherwise through the shared mailbox. Returns the Message-ID so mailbox sync
 * recognises the email and doesn't log it twice.
 */
export async function sendAsUser(user: { id: string; name: string | null; email: string }, o: Opts): Promise<{ messageId: string; via: SendVia; from: string }> {
  if (practiceMode()) { console.log("[practice] not sent: sendAsUser"); return { messageId: `practice-${Date.now()}`, via: "smtp", from: user.email }; }
  const conn = await senderConnection(user.id);
  if (!conn) {
    if (!mailConfigured()) throw new HttpError(501, "Connect your Google account on the Account page, or ask an admin to turn on email sending.");
    const messageId = await sendFollowUp({ to: o.to, subject: o.subject, text: o.text, sender: { name: user.name, email: user.email }, trackToken: o.trackToken || undefined, attachments: o.attachments, headers: o.headers });
    return { messageId, via: "smtp", from: process.env.MAIL_SEND_AS_USER === "true" ? user.email : process.env.MAIL_FROM_ADDRESS || process.env.SMTP_USER || user.email };
  }
  const pixel = o.trackToken && process.env.EMAIL_OPEN_TRACKING !== "false"
    ? `<img src="${appUrl()}/api/t/${o.trackToken}" width="1" height="1" alt="" style="display:block;border:0">` : "";
  const domain = conn.email.split("@")[1] || "localhost";
  const messageId = `<lt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}@${domain}>`;
  const raw = await new Promise<Buffer>((resolve, reject) => new MailComposer({
    from: { name: user.name || conn.email, address: conn.email }, to: o.to, subject: o.subject, messageId, headers: o.headers,
    text: o.text, html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">${toHtml(o.text)}${pixel}</div>`,
    attachments: (o.attachments || []).map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
  }).compile().build((err, msg) => (err ? reject(err) : resolve(msg))));

  if (conn.provider === "google") {
    const base = process.env.GMAIL_API_BASE || "https://gmail.googleapis.com";
    await apiFetch(conn, `${base}/gmail/v1/users/me/messages/send`, { method: "POST", body: JSON.stringify({ raw: raw.toString("base64url") }) });
    return { messageId, via: "gmail", from: conn.email };
  }
  const base = process.env.GRAPH_API_BASE || "https://graph.microsoft.com";
  await apiFetch(conn, `${base}/v1.0/me/sendMail`, { method: "POST", body: raw.toString("base64"), headers: { "Content-Type": "text/plain" } });
  return { messageId, via: "outlook", from: conn.email };
}
