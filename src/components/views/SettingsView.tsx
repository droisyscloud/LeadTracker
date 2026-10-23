"use client";
import useSWR from "swr";
import { useState } from "react";
import Link from "next/link";
import { api, useData } from "../data";
import { Panel } from "../ui";
import { AdminIntegrations } from "./AdminIntegrations";

type Dup = { groups: string[][] };
const JOB_LABEL: Record<string, string> = { sync: "Mailbox sync", sequences: "Sequences", digests: "Daily digests", crm: "CRM push", reminders: "Task reminders" };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
function jobMessage(job: string, x: Record<string, number | string>) {
  const n = (k: string) => Number(x[k] || 0);
  if (job === "sync") return n("mailboxes") ? `Mailbox sync done: ${plural(n("mailboxes"), "mailbox")} checked, ${plural(n("logged"), "email")} logged${n("errors") ? `, ${n("errors")} could not be read` : ""}.` : "Mailbox sync done. Nobody has connected a mailbox yet.";
  if (job === "sequences") return `Sequences done: ${plural(n("sent"), "email")} sent${n("stopped") ? `, ${n("stopped")} stopped` : ""}.`;
  if (job === "digests") return `Daily digests done: ${plural(n("sent"), "digest")} sent.`;
  if (job === "reminders") return `Task reminders done: ${plural(n("dueSoon"), "due-tomorrow reminder")}, ${plural(n("overdue"), "overdue alert")}.`;
  return `CRM push done: ${plural(n("pushed"), "lead")} sent to HubSpot.`;
}
export function SettingsView({ appUrl, intakeKey, ssoNames, jobs }: { appUrl: string; intakeKey: string | null; ssoNames: string[]; jobs: Record<string, { at?: string; error?: string } & Record<string, unknown>> }) {
  const { m, run, toast } = useData();
  const [running, setRunning] = useState("");
  const [checking, setChecking] = useState(false);
  const { data: dups, mutate } = useSWR<Dup>(m.me.role === "admin" || m.me.role === "manager" ? "/api/contacts/duplicates" : null, (u: string) => api<Dup>(u));
  const runJob = async (job: string) => {
    setRunning(job);
    try {
      const r = await api<Record<string, Record<string, number | string>>>(`/api/cron?job=${job}`, { json: {} });
      const x = r[job] || {};
      if (x.error) toast(`${JOB_LABEL[job]} failed: ${x.error}`, "error");
      else toast(jobMessage(job, x));
    } catch (e) { toast(`${JOB_LABEL[job]} failed: ${e instanceof Error ? e.message : "unknown error"}`, "error"); }
    setRunning("");
  };
  const snippet = `<form action="${appUrl}/api/intake?key=${intakeKey || "YOUR_INTAKE_KEY"}" method="POST">
  <input name="name" placeholder="Name" required>
  <input name="email" type="email" placeholder="Work email" required>
  <input name="company" placeholder="Company">
  <input name="phone" placeholder="Phone">
  <textarea name="message" placeholder="How can we help?"></textarea>
  <input name="website_url" style="display:none" tabindex="-1" autocomplete="off">
  <input type="hidden" name="redirect" value="https://www.yourwebsite.com/thank-you">
  <button type="submit">Send</button>
</form>`;
  const Row = ({ label, on, detail }: { label: string; on: boolean; detail: string }) => <tr><td>{label}</td><td><span className="pill" style={{ color: on ? "var(--warm)" : "var(--muted)" }}>{on ? "On" : "Off"}</span></td><td className="small muted">{detail}</td></tr>;
  return <div className="grid">
    <AdminIntegrations />
    <Panel className="s7" title="Integrations" sub="Turned on with server settings. See the README for each one.">
      <table className="tbl"><tbody>
        <Row label="Single sign-on" on={ssoNames.length > 0} detail={ssoNames.join(", ") || "No provider configured"} />
        <Row label="Email sending" on={m.config.mail} detail="Invites, Send now, sequences and daily digests" />
        <Row label="Mailbox and calendar sync" on={m.config.mailboxProviders.length > 0} detail={m.config.mailboxProviders.length ? `People connect on their Account page (${m.config.mailboxProviders.join(", ")})` : "Needs Microsoft or Google SSO"} />
        <Row label="AI" on={m.config.ai} detail={`${m.config.aiProvider === "openai" ? "OpenAI" : m.config.aiProvider === "anthropic" ? "Anthropic Claude" : "Set OPENAI_API_KEY or ANTHROPIC_API_KEY"}: summaries, badge scan, email drafting, company lookup`} />
        <Row label="HubSpot" on={m.config.crm} detail="Push leads and companies to HubSpot" />
        <Row label="Outbound webhook" on={m.config.webhook} detail="Events for Salesforce, Zapier, Power Automate and others" />
        <Row label="Slack or Teams summary" on={m.config.chat} detail="Daily team summary posted to a channel" />
        <Row label="Website form intake" on={m.config.intake} detail="New leads from your website forms" />
      </tbody></table>
    </Panel>
    <Panel className="s5" title="Background jobs" sub="Run every few minutes by the worker. You can also run them now.">
      <table className="tbl"><tbody>{(["sync", "sequences", "digests", "reminders", "crm"] as const).map((j) => <tr key={j}><td>{JOB_LABEL[j]}</td>
        <td className="small muted">{jobs[j]?.at ? new Date(String(jobs[j].at)).toLocaleString() : "Never run"}</td>
        <td className="n"><button className="btn" disabled={!!running} onClick={() => runJob(j)}>{running === j ? "Running…" : "Run now"}</button></td></tr>)}</tbody></table>
    </Panel>
    <Panel className="s7" title="Website form" sub="Paste this into any page on your website. Change the thank-you address to your own page. Submissions become new leads tagged Immediate follow-up.">
      {m.config.intake ? <><pre style={{ whiteSpace: "pre-wrap", fontSize: ".8rem", background: "var(--chip)", padding: 12, borderRadius: 10, overflowX: "auto", margin: 0 }}>{snippet}</pre>
        <div className="btns" style={{ marginTop: 10, display: "flex", gap: 8 }}><button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(snippet); toast("Copied"); } catch { toast("Copy failed", "error"); } }}>Copy form code</button></div></>
        : <p className="empty">Set INTAKE_KEYS on the server to turn this on.</p>}
    </Panel>
    <Panel className="s5" title="Possible duplicate people" sub="Same email, or the same name at the same company." action={<button className="linkbtn" disabled={checking} onClick={async () => {
      setChecking(true);
      try { const r = await mutate(); const n = r?.groups.length ?? 0; toast(n ? `Checked: ${n} possible duplicate${n === 1 ? "" : "s"} found` : "Checked: no duplicates found"); }
      catch (e) { toast(`Couldn't check for duplicates: ${e instanceof Error ? e.message : "please try again"}`, "error"); }
      finally { setChecking(false); } }}>{checking ? "Checking…" : "Recheck"}</button>}>
      {dups?.groups.length ? <ul className="feed">{dups.groups.map((g) => { const cs = g.map((id) => m.contactMap.get(id)).filter(Boolean) as NonNullable<ReturnType<typeof m.contactMap.get>>[];
        if (cs.length < 2) return null;
        const primary = cs.reduce((a, b) => ((m.actsByContact.get(b.id)?.length || 0) > (m.actsByContact.get(a.id)?.length || 0) ? b : a));
        return <li key={g.join()}><b>{cs.map((c) => c.name).join(" / ")}</b><div className="small muted">{cs.map((c) => c.email || "no email").join(", ")}</div>
          <div className="inline" style={{ marginTop: 6 }}><Link className="linkbtn" href={`/contacts?id=${primary.id}`}>Open</Link>
            <button className="linkbtn" onClick={async () => { if (!confirm(`Merge into ${primary.name}? Activity, tasks, deals and products move to one record.`)) return; await run(() => api("/api/contacts/merge", { json: { primaryId: primary.id, duplicateIds: cs.filter((c) => c.id !== primary.id).map((c) => c.id) } }), "Merged"); mutate(); }}>Merge into one</button></div></li>; })}</ul>
        : <p className="empty">{dups ? "No duplicates found." : "Checking…"}</p>}
    </Panel>
  </div>;
}
