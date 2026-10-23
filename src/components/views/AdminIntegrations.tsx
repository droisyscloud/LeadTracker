"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { api, useData } from "../data";
import { PermissionsPanel } from "../PermissionsPanel";
import { Panel } from "../ui";
import { ago } from "../model";
import { AccountingPanel } from "../Accounting";
import { CurrencyPanel } from "../Currency";
import { DataHealth, SyncHealth } from "../DataHealth";
import { AiCheck } from "../AiCheck";

type S = {
  postalAddress: string; defaultAddress: string;
  company: { name: string; about: string; email: string; phone: string; website: string; quoteFooter: string }; customLogo: { logo: boolean; mark: boolean };
  billing: { accountsEmails: string[]; cc: string[] };
  chat: { connected: boolean; url: string; events: Record<string, boolean>; eventList: [string, string][] };
  backup: { enabled: boolean; keep: number; lastAt: number | null; lastLink: string | null; lastName: string | null; lastError: string | null; owner: string | null; myDriveReady: boolean; myGoogle: boolean };
};

/** Company address for emails, Google Chat alerts and Drive backups. Admins change them; managers can see them. */
export function AdminIntegrations() {
  const { m, perms, run, toast } = useData();
  const { data, mutate } = useSWR<S>("/api/admin/integrations", (u: string) => api<S>(u));
  const [addr, setAddr] = useState(""); const [url, setUrl] = useState(""); const [events, setEvents] = useState<Record<string, boolean>>({});
  const [keep, setKeep] = useState(12); const [busy, setBusy] = useState(""); const [acct, setAcct] = useState(""); const [acctCc, setAcctCc] = useState("");
  useEffect(() => { if (data) { setAddr(data.postalAddress); setUrl(data.chat.url); setEvents(data.chat.events); setKeep(data.backup.keep); setAcct(data.billing.accountsEmails.join(", ")); setAcctCc(data.billing.cc.join(", ")); } }, [data]);
  if (!data) return null;
  const admin = perms.admin;
  const save = async (json: unknown, msg: string) => { const r = await run(() => api("/api/admin/integrations", { method: "PUT", json }), msg); if (r) mutate(); return r; };
  const b = data.backup;
  return <>
    <CompanyPanel data={data} admin={admin} save={save} reload={() => mutate()} />
    <PermissionsPanel />
      {(perms.admin || perms.billing) && <AccountingPanel />}
      {perms.money && <CurrencyPanel />}
      <AiCheck />
      <SyncHealth />
      {perms.write && <DataHealth />}
    <Panel className="s6" title="Email compliance" sub="Every automated sequence email carries this address and a one-click unsubscribe link, as US anti-spam law (CAN-SPAM) requires. People who unsubscribe are never emailed by sequences again.">
      <div className="form">
        <label>Company postal address<input type="text" value={addr} disabled={!admin} onChange={(e) => setAddr(e.target.value)} placeholder="Street, city, state and ZIP" /></label>
        {!data.postalAddress && <p className="small" style={{ margin: 0, color: "var(--mild)" }}>Add your company's postal address before sending sequences, for example "100 Main St, Suite 200, Austin, TX 78701".</p>}
        {admin && <div className="btns"><button className="btn primary" disabled={addr.trim().length < 10 || addr.trim() === data.postalAddress} onClick={() => save({ postalAddress: addr.trim() }, "Address saved")}>Save address</button></div>}
      </div>
    </Panel>
    <Panel className="s6" title="Billing: accounts team" sub="Invoice requests from deals (Contracts & billing) go to these addresses. Add more than one with commas.">
      <div className="form">
        <label>Accounts team email<input type="text" value={acct} disabled={!admin} onChange={(e) => setAcct(e.target.value)} placeholder="accounts@yourcompany.com" /></label>
        <label>Also copy (optional)<input type="text" value={acctCc} disabled={!admin} onChange={(e) => setAcctCc(e.target.value)} placeholder="finance@yourcompany.com" /></label>
        {admin && <div className="btns"><button className="btn primary" onClick={() => { const split = (v: string) => v.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean); save({ billing: { accountsEmails: split(acct), cc: split(acctCc) } }, "Accounts team saved"); }}>Save</button></div>}
      </div>
    </Panel>
    <Panel className="s12" title="Google Chat alerts" sub="Post team alerts to a Google Chat space. In Google Chat, open the space, then Apps & integrations, Webhooks, Add webhook, and paste the link here.">
      <div className="form">
        {admin ? <label>Webhook link<input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://chat.googleapis.com/v1/spaces/…" /></label>
          : <p className="small" style={{ margin: 0 }}>{data.chat.connected ? "Connected to a Google Chat space." : "Not connected yet. An admin can set this up."}</p>}
        <div className="chips" style={{ marginTop: 0 }}>{data.chat.eventList.map(([k, l]) => <button key={k} type="button" className="chip" disabled={!admin} aria-pressed={events[k] !== false} onClick={() => setEvents({ ...events, [k]: events[k] === false })}>{l}</button>)}</div>
        {admin && <div className="btns">
          <button className="btn primary" onClick={() => save({ chat: { url: url.trim(), events } }, url.trim() ? "Google Chat alerts saved" : "Google Chat alerts turned off")}>Save</button>
          {data.chat.connected && <button className="btn" onClick={() => run(() => api("/api/admin/chat-test", { json: {} }), "Test message sent to the space")}>Send a test</button>}
        </div>}
      </div>
    </Panel>
    <Panel className="s12" title="Weekly backup to Google Drive" sub="Once a week, a spreadsheet of Sales data (every lead, company, deal, activity and task) is saved to a '${m.config.brand.appName} backups' folder in the Drive of the admin who sets it up. The app can only see the backup files it creates, nothing else in that Drive.">
      <div className="form">
        <p className="small" style={{ margin: 0 }}>{b.enabled ? <>On. Saving to <b>{b.owner}</b>'s Drive, keeping the newest {b.keep}.</> : "Off."}{" "}
          {b.lastAt ? <>Last backup {ago(b.lastAt)}{b.lastLink && <>: <a className="colink" href={b.lastLink} target="_blank" rel="noopener">{b.lastName}</a></>}.</> : "No backups yet."}</p>
        {b.lastError && <div className="banner" style={{ margin: 0, borderColor: "var(--cold)" }}>Last attempt failed: {b.lastError}</div>}
        {admin && !b.myDriveReady && <div className="banner" style={{ margin: 0 }}>{b.myGoogle ? "Your Google account was connected before backups existed. Reconnect it on the Account page (Disconnect, then Connect Google) to give the app permission to save backups to your Drive." : "Connect your Google account on the Account page first."}</div>}
        {admin && <div className="inline" style={{ gap: 10, flexWrap: "wrap" }}>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>Keep the newest<select value={keep} onChange={(e) => setKeep(Number(e.target.value))} style={{ width: "auto" }}>{[4, 8, 12, 26, 52].map((n) => <option key={n} value={n}>{n}</option>)}</select>backups</label>
        </div>}
        {admin && <div className="btns">
          {b.enabled ? <button className="btn" onClick={() => save({ backup: { enabled: false, keep } }, "Weekly backups turned off")}>Turn off</button>
            : <button className="btn primary" disabled={!b.myDriveReady} onClick={() => save({ backup: { enabled: true, keep, useMyDrive: true } }, "Weekly backups turned on")}>Turn on, save to my Drive</button>}
          {b.enabled && keep !== b.keep && <button className="btn" onClick={() => save({ backup: { enabled: true, keep } }, "Saved")}>Save</button>}
          <button className="btn" disabled={busy === "run" || !(b.enabled || b.myDriveReady)} onClick={async () => {
            if (!b.enabled) { const r = await save({ backup: { enabled: false, keep, useMyDrive: true } }, ""); if (!r) return; }
            setBusy("run"); const r = await run(() => api<{ link: string; name: string }>("/api/admin/backup-run", { json: {} })); setBusy("");
            if (r) { toast(`Backup saved: ${r.name}`); mutate(); } }}>{busy === "run" ? "Backing up…" : "Back up now"}</button>
        </div>}
      </div>
    </Panel>
  </>;
}

/** Who you are: shown on the sign-in page, quotes, booking pages and emails, and used by the AI to describe what you sell. */
function CompanyPanel({ data, admin, save, reload }: { data: S; admin: boolean; save: (json: unknown, msg: string) => Promise<unknown>; reload: () => void }) {
  const { run, toast } = useData();
  const c = data.company;
  const [f, setF] = useState({ companyName: c.name, about: c.about, email: c.email, phone: c.phone, website: c.website, quoteFooter: c.quoteFooter });
  const [v, setV] = useState(0);   // reloads the logo previews after an upload
  useEffect(() => { setF({ companyName: c.name, about: c.about, email: c.email, phone: c.phone, website: c.website, quoteFooter: c.quoteFooter }); }, [c.name, c.about, c.email, c.phone, c.website, c.quoteFooter]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const upload = async (kind: "logo" | "mark", file?: File) => {
    if (!file) return;
    const fd = new FormData(); fd.append("kind", kind); fd.append("file", file);
    const ok = await run(async () => { const r = await fetch("/api/admin/brand", { method: "POST", body: fd }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Upload failed."); return j; }, kind === "logo" ? "Logo saved" : "Icon saved");
    if (ok) { setV(Date.now()); reload(); }
  };
  const reset = async (kind: "logo" | "mark") => { if (await run(() => api(`/api/admin/brand?kind=${kind}`, { method: "DELETE" }), "Back to the default")) { setV(Date.now()); reload(); } };
  const changed = f.companyName.trim() !== c.name || f.about !== c.about || f.email !== c.email || f.phone !== c.phone || f.website !== c.website || f.quoteFooter !== c.quoteFooter;
  const Logo = ({ kind, label, hint }: { kind: "logo" | "mark"; label: string; hint: string }) => <div className="brand-up">
    <span className="small">{label}</span>
    <div className="brand-prev"><img src={`/api/public/brand/${kind}?v=${v}`} alt="" className={kind === "logo" ? "brand-prev-logo" : "brand-prev-mark"} /></div>
    <span className="small muted">{hint}</span>
    {admin && <div className="btns" style={{ marginTop: 0 }}>
      <label className="btn sm">Upload<input type="file" hidden accept="image/png,image/jpeg" onChange={(e) => { upload(kind, e.target.files?.[0]); e.target.value = ""; }} /></label>
      {data.customLogo[kind] && <button type="button" className="linkbtn small" onClick={() => reset(kind)}>Use default</button>}</div>}
  </div>;
  return <Panel className="s12" title="Company profile" sub="Your name and logo appear on the sign-in page, quotes, booking pages and emails. The AI uses &quot;What you sell&quot; when it drafts emails, summaries and quotes.">
    <div className="company-grid">
      <div className="form">
        <label>Company name<input type="text" value={f.companyName} disabled={!admin} onChange={set("companyName")} placeholder="Acme Ltd" /></label>
        <label>What you sell<input type="text" value={f.about} disabled={!admin} onChange={set("about")} placeholder="One sentence, e.g. Fleet tracking software for logistics companies" /></label>
        <div className="row2"><label>Email<input type="text" value={f.email} disabled={!admin} onChange={set("email")} placeholder="hello@yourcompany.com" /></label>
          <label>Phone<input type="text" value={f.phone} disabled={!admin} onChange={set("phone")} placeholder="+1 555 010 0100" /></label></div>
        <label>Website<input type="text" value={f.website} disabled={!admin} onChange={set("website")} placeholder="www.yourcompany.com" /></label>
        <label>Note at the bottom of quotes<input type="text" value={f.quoteFooter} disabled={!admin} onChange={set("quoteFooter")} placeholder="Thank you for your business." /></label>
        {admin && <div className="btns"><button className="btn primary" disabled={!changed || !f.companyName.trim()} onClick={() => { if (!f.companyName.trim()) { toast("Enter your company name.", "error"); return; } save({ company: { ...f, companyName: f.companyName.trim() } }, "Company profile saved"); }}>Save company profile</button></div>}
      </div>
      <div className="brand-logos">
        <Logo kind="logo" label="Logo" hint="Wide version, PNG or JPEG, under 512 KB. A transparent PNG with dark artwork looks best." />
        <Logo kind="mark" label="Icon" hint="Square version, used when the menu is collapsed and on booking pages." />
      </div>
    </div>
  </Panel>;
}
