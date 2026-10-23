"use client";
import { useMemo, useState } from "react";
import { BookingSettings } from "./BookingSettings";
import { PasswordPanel } from "../PasswordPanel";
import { PushSettings } from "./PushSettings";
import { api, useData } from "../data";
import { Avatar, Panel } from "../ui";
import { ago, ROLE_CAN, ROLE_LABEL } from "../model";

type Action = () => Promise<void>;
export function AccountView({ signOutAction, connectMicrosoft, connectGoogle, provider, passwordAuth }: { signOutAction: Action; connectMicrosoft: Action; connectGoogle: Action; provider: string; passwordAuth?: boolean }) {
  const { m, run, toast } = useData();
  const [syncing, setSyncing] = useState("");
  const me = m.me; const conn = m.connection;
  const zones = useMemo(() => { let z: string[] = []; try { z = Intl.supportedValuesOf("timeZone"); } catch { /* old browser */ } return [...new Set([...z, "Asia/Kolkata", "America/Los_Angeles", me.timezone])].sort(); }, [me.timezone]);
  const [tz, setTz] = useState(me.timezone);
  return <div className="grid">
    <Panel className="s6" title="Your account">
      <div className="acct-card"><Avatar name={me.name || me.email} image={me.image} size={56} /><div><div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{me.name || me.email}</div><div className="muted small">{me.email}</div><span className="role" style={{ marginTop: 6 }}>{ROLE_LABEL[me.role]}</span></div></div>
      <dl className="kv" style={{ marginTop: 18 }}>
        <dt>Signed in with</dt><dd>{provider}</dd><dt>Member since</dt><dd>{new Date(me.createdAt).toLocaleDateString()}</dd>
        <dt>Last sign-in</dt><dd>{ago(me.lastLoginAt)}</dd><dt>You can</dt><dd>{ROLE_CAN[me.role].join("; ")}</dd>
      </dl>
      <form action={signOutAction} style={{ marginTop: 20 }}><button className="btn" type="submit">Sign out</button></form>
    </Panel>
    {passwordAuth && <PasswordPanel />}
    <Panel className="s6" title="Mailbox and calendar" sub="Connect once so replies and sent emails with your leads are logged automatically, and you can book meetings from your real free time.">
      {conn ? <>
        <dl className="kv"><dt>Connected</dt><dd>{conn.email} ({conn.provider === "microsoft" ? "Microsoft 365" : "Google Workspace"})</dd>
          <dt>Status</dt><dd><SyncStatus status={conn.status} error={conn.lastError} provider={conn.provider} /></dd>
          <dt>Sending</dt><dd>{conn.canSend ? <span style={{ color: "var(--warm)" }}>✓ "Send now" goes out from {conn.email}</span>
            : <span style={{ color: "var(--mild)" }}>Not allowed yet. Click <b>Reconnect</b> and approve "Send email on your behalf" to send from your own {conn.provider === "google" ? "Gmail" : "Outlook"}.</span>}</dd>
          <dt>Last sync</dt><dd>{ago(conn.lastSyncAt)}</dd></dl>
        <div className="btns" style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <button className="btn primary" disabled={!!syncing} onClick={async () => { setSyncing("now"); const r = await run(() => api<{ logged: number; updated: number }>("/api/me/mailbox", { json: {} })); setSyncing(""); if (r) toast(r.logged ? `Mailbox synced: ${r.logged} new email${r.logged === 1 ? "" : "s"} logged` : "Mailbox synced. Nothing new with your leads."); }}>{syncing === "now" ? "Syncing…" : "Sync now"}</button>
          <button className="btn" disabled={!!syncing} title="Re-read the last 30 days and fill in full emails, recipients and attachments" onClick={async () => { setSyncing("full"); const r = await run(() => api<{ logged: number; updated: number }>("/api/me/mailbox", { json: { refresh: true, days: 30 } })); setSyncing(""); if (r) toast(`Last 30 days re-synced: ${r.logged} new, ${r.updated} updated with full details`); }}>{syncing === "full" ? "Re-syncing 30 days…" : "Re-sync last 30 days in full"}</button>
          <form action={conn.provider === "microsoft" ? connectMicrosoft : connectGoogle}><button className="btn" type="submit">Reconnect</button></form>
          <button className="btn danger" onClick={() => confirm("Disconnect your mailbox and calendar? Logged history stays.") && run(() => api("/api/me/mailbox", { method: "DELETE" }), "Disconnected")}>Disconnect</button>
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>Only emails to or from people already in the app are logged. Those are saved in full, with who they were sent to and any attachments, and your team can see them on the lead. Nothing else in your mailbox is read or stored.</p>
      </> : m.config.mailboxProviders.length ? <>
        <div className="btns" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {m.config.mailboxProviders.includes("microsoft") && <form action={connectMicrosoft}><button className="btn primary" type="submit">Connect Microsoft 365</button></form>}
          {m.config.mailboxProviders.includes("google") && <form action={connectGoogle}><button className="btn primary" type="submit">Connect Google Workspace</button></form>}
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>You will be asked to allow reading mail and managing calendar events. Only emails with people already in the app are logged, in full, on that lead.</p>
      </> : <p className="empty">Mailbox sync needs Microsoft or Google sign-in to be set up on the server.</p>}
    </Panel>
    <Panel className="s6" title="Daily digest" sub="A morning email with your follow-ups, tasks due and leads going cold, on weekdays.">
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={me.digestOptIn} onChange={(e) => run(() => api("/api/me", { method: "PATCH", json: { digestOptIn: e.target.checked } }), e.target.checked ? "Digest on" : "Digest off")} />Send me the daily digest</label>
      <div className="inline" style={{ marginTop: 12 }}>
        <select aria-label="Time zone" value={tz} onChange={(e) => setTz(e.target.value)}>{zones.map((z) => <option key={z}>{z}</option>)}</select>
        <button className="btn" disabled={tz === me.timezone} onClick={() => run(() => api("/api/me", { method: "PATCH", json: { timezone: tz } }), "Time zone saved")}>Save time zone</button>
      </div>
      {m.config.mail ? <button className="btn" style={{ marginTop: 12 }} onClick={() => run(() => api("/api/me/digest", { json: {} }), "Digest sent to your inbox")}>Send me one now</button>
        : <p className="small muted" style={{ marginTop: 12 }}>Email is not configured on this server yet, so digests are not sent.</p>}
    </Panel>
    <Panel className="s6" title="Security">
      <dl className="kv">
        <dt>Login</dt><dd>{passwordAuth ? "Your password is stored only as a one-way scrambled code, so nobody can read it, not even admins." : "Single sign-on through your company identity provider. The app never sees your password."}</dd>
        <dt>Session</dt><dd>Signed sessions expire automatically. Signing out ends this session on this device.</dd>
        <dt>Mailbox access</dt><dd>Access tokens are stored encrypted and used only to sync messages with your leads and to read your free time. Disconnect at any time.</dd>
        <dt>Access</dt><dd>Your role is checked on the server for every action. If an admin disables your account, access stops on your next request.</dd>
      </dl>
    </Panel>
    <PushSettings />
    {m.me.role !== "viewer" && <BookingSettings />}
  </div>;
}

/** Plain-language mailbox status. Technical details stay behind a "Details" toggle for whoever fixes it. */
function SyncStatus({ status, error, provider }: { status: string; error: string | null; provider: string }) {
  const [open, setOpen] = useState(false);
  const who = provider === "google" ? "Google" : "Microsoft";
  if (status === "ok" && error === "rate-limited") return <span style={{ color: "var(--mild)" }}>⏸ {who} asked us to slow down. The next sync, within 5 minutes, carries on automatically.</span>;
  if (status === "ok") return <span style={{ color: "var(--warm)" }}>✓ Working</span>;
  const e = error || "";
  const msg = /invalid_grant|401|expired|revoked|unauthori/i.test(e) ? `Access to your ${who} account expired. Click Reconnect.`
    : /403/.test(e) && /disabled|has not been used|not enabled|accessNotConfigured/i.test(e) ? `${who === "Google" ? "The Gmail or Calendar API is not switched on in Google Cloud" : "This permission is not granted in Microsoft Entra"}. Ask your IT admin, then click Sync now.`
    : /403|insufficient|scope|permission/i.test(e) ? "The app is missing permission to read mail. Click Reconnect and allow access."
    : "Sync did not finish. Click Sync now to try again, or Reconnect if it keeps happening.";
  return <span style={{ color: "var(--cold)" }}>✕ {msg} {e && <button className="linkbtn" style={{ fontSize: ".82rem" }} onClick={() => setOpen(!open)}>{open ? "Hide details" : "Details"}</button>}
    {open && <code style={{ display: "block", marginTop: 6, fontSize: ".75rem", color: "var(--muted)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{e}</code>}</span>;
}
