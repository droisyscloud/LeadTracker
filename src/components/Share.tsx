"use client";
import Link from "next/link";
import { useState } from "react";
import { Modal, useData } from "./data";

/* Share a note or an email: only me, everyone on the team, or specific people by email address. */
type Mode = "private" | "team" | "people";
export function ShareButton({ entity, id, shared, sharedWith, onDone, what = "this", peopleOnly }: { entity: "note" | "email" | "activity"; id: string; shared: boolean; sharedWith: string[]; onDone: () => void; what?: string;
  /** entries everyone on the lead already sees: share with specific people (or stop sharing) */ peopleOnly?: boolean }) {
  const { m, toast } = useData(); const [open, setOpen] = useState(false);
  const users = (m.users || []) as { id: string; name: string | null; email: string }[];
  const mode0: Mode = shared ? "team" : sharedWith.length ? "people" : "private";
  const [mode, setMode] = useState<Mode>(mode0); const [emails, setEmails] = useState<string[]>([]); const [typed, setTyped] = useState(""); const [missing, setMissing] = useState<string[]>([]); const [busy, setBusy] = useState(false);
  const label = shared ? "👥 Shared with the team" : sharedWith.length ? `👤 Shared with ${sharedWith.length === 1 ? users.find((u) => u.id === sharedWith[0])?.name || "1 person" : `${sharedWith.length} people`}` : "🔒 Only you";
  const start = () => { setMode(mode0); setEmails(sharedWith.map((x) => users.find((u) => u.id === x)?.email || "").filter(Boolean)); setTyped(""); setMissing([]); setOpen(true); };
  const addTyped = () => { const xs = typed.split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => x.includes("@")); if (xs.length) setEmails((e) => [...new Set([...e, ...xs])]); setTyped(""); };
  const save = async () => { const list = [...new Set([...emails, ...typed.split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => x.includes("@"))])]; setBusy(true);
    try { const r = await fetch("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entity, id, mode, emails: list }) }); const j = await r.json().catch(() => ({}));
      if (r.status === 422 && j.missing) { setMissing(j.missing); setEmails(list); setTyped(""); return; }
      if (!r.ok) throw new Error(j.error || "Couldn't share it.");
      toast(mode === "private" ? "Only you can see it now" : mode === "team" ? "Shared with the team" : `Shared with ${list.length} ${list.length === 1 ? "person" : "people"}; they've been notified`); setOpen(false); onDone(); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't share it.", "error"); } finally { setBusy(false); } };
  return <><button type="button" className="linkbtn small share-btn" onClick={start} title="Who can see this">{label} · Share</button>
    {open && <Modal open label="Share" onClose={() => setOpen(false)}><div className="dlg form share-dlg">
      <header><h3 style={{ margin: 0 }}>Share {what}</h3></header>
      {peopleOnly && <p className="small muted" style={{ margin: 0 }}>Everyone who can see this lead already sees it. Share it with specific people to send it to them; they can open this lead to read it and reply.</p>}
      <div className="share-opts" role="radiogroup">{(peopleOnly ? [["private", "Not shared with anyone else"], ["people", "👤 Specific people"]] as const : [["private", "🔒 Only me"], ["team", "👥 Everyone on the team"], ["people", "👤 Specific people"]] as const).map(([k, l]) =>
        <label key={k} className="chk"><input type="radio" name="share" checked={mode === k} onChange={() => setMode(k)} /> {l}</label>)}</div>
      {mode === "people" && <>
        <label>Their email addresses<input type="text" list="share-people" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTyped(); } }} onBlur={addTyped} placeholder="name@yourcompany.com" autoFocus /></label>
        <datalist id="share-people">{users.filter((u) => u.id !== m.me.id).map((u) => <option key={u.id} value={u.email}>{u.name || u.email}</option>)}</datalist>
        {emails.length > 0 && <div className="chips">{emails.map((e) => <span key={e} className={"chip" + (missing.includes(e) ? " share-miss" : "")} aria-pressed="true">{users.find((u) => u.email.toLowerCase() === e)?.name || e}
          <button type="button" className="linkbtn" onClick={() => { setEmails((x) => x.filter((y) => y !== e)); setMissing((x) => x.filter((y) => y !== e)); }} aria-label={`Remove ${e}`}>×</button></span>)}</div>}
        {missing.length > 0 && <div className="banner share-warn" role="alert"><b>{missing.join(", ")} {missing.length === 1 ? "isn't" : "aren't"} in the app yet.</b> Add {missing.length === 1 ? "them" : "them"} first, then share.
          {m.canScope ? <Link className="btn sm" href={`/team?invite=${encodeURIComponent(missing.join(", "))}`}>Invite {missing.length === 1 ? "them" : "them"}</Link> : <span className="small"> Ask an admin to invite {missing.length === 1 ? "them" : "them"}.</span>}
          <span className="small muted"> Or remove {missing.length === 1 ? "them" : "them"} and share with the others.</span></div>}
      </>}
      <div className="btns"><button type="button" className="btn primary" disabled={busy || (mode === "people" && !emails.length && !typed.includes("@"))} onClick={save}>{busy ? "Saving…" : "Save"}</button><button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button></div>
    </div></Modal>}</>;
}
