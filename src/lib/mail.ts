import nodemailer, { type Transporter } from "nodemailer";
import { appUrl, mailConfigured } from "./config";
import { practiceMode } from "./config";
import { appName, company } from "./brand";
import { passwordEnabled } from "./password";

let transport: Transporter | null = null;
function tx(): Transporter {
  if (!mailConfigured()) throw new Error("Email is not configured. Set SMTP_HOST and related variables.");
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function textToHtml(text: string) {
  return esc(text).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>")}</p>`).join("");
}

export async function sendFollowUp(opts: {
  to: string; subject: string; text: string; sender: { name: string | null; email: string };
  trackToken?: string; attachments?: { filename: string; content: Buffer; contentType: string }[]; headers?: Record<string, string>;
}) {
  if (practiceMode()) { console.log("[practice] not sent: sendFollowUp"); return { messageId: `practice-${Date.now()}` } as never; }
  const from = process.env.MAIL_SEND_AS_USER === "true"
    ? { name: opts.sender.name || opts.sender.email, address: opts.sender.email }
    : { name: `${opts.sender.name || (await company()).name} (${(await company()).name})`, address: process.env.MAIL_FROM_ADDRESS || process.env.SMTP_USER || "" };
  const pixel = opts.trackToken && process.env.EMAIL_OPEN_TRACKING !== "false"
    ? `<img src="${appUrl()}/api/t/${opts.trackToken}" width="1" height="1" alt="" style="display:block;border:0">` : "";
  const html = `<div style="font-family:Calibri,Arial,sans-serif;font-size:15px;line-height:1.5;color:#0E1E38">${textToHtml(opts.text)}${pixel}</div>`;
  const info = await tx().sendMail({ from, replyTo: opts.sender.email, to: opts.to, subject: opts.subject, text: opts.text, html, attachments: opts.attachments, headers: opts.headers });
  return info.messageId as string;
}

export async function sendInvite(opts: { to: string; roleLabel: string; inviter: string; token: string }) {
  if (practiceMode()) { console.log("[practice] not sent: sendInvite"); return; }
  const link = `${appUrl()}/login?invite=${encodeURIComponent(opts.token)}`;
  const us = await company(); const app = appName();
  const text = `Hi,\n\n${opts.inviter} invited you to ${app} at ${us.name} as ${opts.roleLabel}. It is where the team tracks leads, sends follow-ups and sees pipeline metrics.\n\nJoin here: ${link}\n\n${passwordEnabled() ? "Open the link to choose your password." : `Sign in with your ${us.name} work account.`}\n\n${us.name}`;
  await tx().sendMail({
    from: { name: `${us.name} ${app}`, address: process.env.MAIL_FROM_ADDRESS || process.env.SMTP_USER || "" },
    to: opts.to, subject: `You're invited to ${us.name} ${app}`, text,
    html: `<div style="font-family:Calibri,Arial,sans-serif;font-size:15px;line-height:1.5;color:#0E1E38">${textToHtml(text.replace(link, "LINK"))
      .replace("LINK", `<a href="${link}" style="color:#1A6FE8">${esc(link)}</a>`)}</div>`,
  });
  return link;
}

export async function sendSystemEmail(opts: { to: string; subject: string; text: string; attachments?: { filename: string; content: Buffer | string; contentType?: string }[] }) {
  if (practiceMode()) { console.log("[practice] not sent: sendSystemEmail"); return; }
  await tx().sendMail({ from: { name: `${(await company()).name} ${appName()}`, address: process.env.MAIL_FROM_ADDRESS || process.env.SMTP_USER || "" }, to: opts.to, subject: opts.subject, text: opts.text, attachments: opts.attachments,
    html: `<div style="font-family:Calibri,Arial,sans-serif;font-size:15px;line-height:1.5;color:#0E1E38">${textToHtml(opts.text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#1A6FE8">$1</a>')}</div>` });
}
