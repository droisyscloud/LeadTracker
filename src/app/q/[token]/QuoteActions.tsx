"use client";
import { useEffect, useState } from "react";

export function QuoteActions({ token, status, expired, respondedBy }: { token: string; status: string; expired: boolean; respondedBy: string }) {
  const [st, setSt] = useState(status); const [name, setName] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { fetch(`/api/public/quote/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "view" }) }).catch(() => undefined); }, [token]);
  const act = async (action: "accept" | "decline") => { setBusy(true); setErr("");
    const r = await fetch(`/api/public/quote/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, name }) }); const j = await r.json().catch(() => ({}));
    setBusy(false); if (r.ok) setSt(j.status); else setErr(j.error || "Something went wrong. Please try again."); };
  return <div className="q-actions">
    <a className="btn" href={`/api/public/quote/${token}/pdf`} target="_blank" rel="noreferrer">Download PDF</a>
    {st === "accepted" ? <p className="q-done">✓ Accepted{respondedBy ? ` by ${respondedBy}` : ""}. Thank you, we'll be in touch shortly.</p>
      : st === "declined" ? <p className="q-done muted">This quote was declined.</p>
      : expired ? <p className="small muted">This quote has expired. Please reply to the email for an updated one.</p>
      : <div className="q-accept"><input type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" />
        <button type="button" className="btn primary" disabled={busy || !name.trim()} onClick={() => act("accept")}>Accept quote</button><button type="button" className="btn ghost" disabled={busy} onClick={() => act("decline")}>Decline</button></div>}
    {err && <p className="small" style={{ color: "var(--cold)" }}>{err}</p>}
  </div>;
}
