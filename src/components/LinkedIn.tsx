"use client";
import { useState } from "react";
import { api, Modal, useData } from "./data";
import { Linkify } from "./Linkify";

/* LinkedIn on contacts: find their profile (AI web search, you confirm), fill details from a LinkedIn PDF or copied profile. */
export type LiFields = { linkedinUrl?: string; background?: string; title?: string; company?: string; email?: string; phone?: string; name?: string; location?: string };
export function LinkedInBadge({ url }: { url?: string }) {
  if (!url) return null;
  return <a className="li-badge" href={url} target="_blank" rel="noreferrer noopener" title="Open their LinkedIn profile" aria-label="LinkedIn profile">in</a>;
}
type Found = { url: string | null; confidence: string | null; headline: string; location: string; summary: string; sources: string[]; candidates?: { url: string; confidence: string; name: string; headline: string; company: string; location: string; summary: string }[] };
export function LinkedInTools({ who, onApply, compact }: { who: { name: string; company?: string; title?: string; email?: string }; onApply: (f: LiFields) => void | Promise<void>; compact?: boolean }) {
  const { m, toast } = useData(); const [found, setFound] = useState<Found | null>(null); const [busy, setBusy] = useState(""); const [reading, setReading] = useState(false); const [text, setText] = useState(""); const [read, setRead] = useState<LiFields | null>(null);
  if (!m.config.ai) return null;
  const find = async () => { if (who.name.trim().length < 2) { toast("Add their name first.", "error"); return; } setBusy("find");
    try { const r = await api<Found>("/api/contacts/linkedin/find", { json: { name: who.name, company: who.company || "", title: who.title || "", email: who.email || "" } }); setFound(r); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't search right now.", "error"); } setBusy(""); };
  const [link, setLink] = useState("");
  const readUrl = async () => { setBusy("url");
    try { const r = await api<LiFields>("/api/contacts/linkedin/url", { json: { url: link.trim() } }); setRead(r); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't use that link.", "error"); } setBusy(""); };
  const readIt = async (file?: File) => { setBusy("read"); const fd = new FormData(); if (file) fd.append("file", file); else fd.append("text", text);
    try { const r = await fetch("/api/contacts/linkedin/read", { method: "POST", body: fd }); const j = await r.json(); if (!r.ok) throw new Error(j.error || "Couldn't read that."); setRead({ ...j, linkedinUrl: j.url }); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't read that.", "error"); } setBusy(""); };
  return <>
    <button type="button" className={"btn" + (compact ? " sm" : "")} disabled={!!busy} onClick={find}>{busy === "find" ? "Searching…" : "✨ Find LinkedIn"}</button>
    <button type="button" className={"btn ghost" + (compact ? " sm" : "")} onClick={() => { setReading(true); setRead(null); setText(""); setLink(""); }}>Fill from LinkedIn</button>
    {found && <Modal open label="LinkedIn profile" onClose={() => setFound(null)}><div className="dlg li-dlg">
      {found.candidates && found.candidates.length > 1 ? <><h3 style={{ margin: 0 }}>Which one is {who.name}?</h3>
        <p className="small muted" style={{ margin: 0 }}>Found {found.candidates.length} possible profiles{who.title || who.company ? ` (searched by ${[who.title, who.company].filter(Boolean).join(" at ")})` : ""}. Open a link to check, then pick the right one.</p>
        <ul className="li-cands">{found.candidates.map((c) => <li key={c.url}>
          <div className="li-c-top"><a className="li-found" href={c.url} target="_blank" rel="noreferrer noopener"><span className="li-badge">in</span> {c.name || c.url.replace("https://www.linkedin.com/in/", "")}</a>
            <span className={"pill" + (c.confidence === "high" ? " fu-p-high" : "")}>{c.confidence === "high" ? "Strong match" : c.confidence === "medium" ? "Likely" : "Possible"}</span></div>
          {(c.headline || c.company || c.location) && <p className="small" style={{ margin: 0 }}><b>{c.headline || c.company}</b>{c.location ? ` · ${c.location}` : ""}</p>}
          {c.summary && <p className="small muted" style={{ margin: 0 }}>{c.summary}</p>}
          <button type="button" className="btn sm primary" onClick={async () => { await onApply({ linkedinUrl: c.url, background: c.summary, title: c.headline.split(/ at | @ /i)[0] }); setFound(null); }}>This is them</button></li>)}</ul>
        <div className="btns"><button type="button" className="btn ghost" onClick={() => setFound(null)}>None of these</button></div></>
      : found.url ? <><h3 style={{ margin: 0 }}>Is this {who.name}?</h3>
        <a className="li-found" href={found.url} target="_blank" rel="noreferrer noopener"><span className="li-badge">in</span> {found.url.replace("https://www.", "")}</a>
        <span className={"pill" + (found.confidence === "high" ? " fu-p-high" : "")}>{found.confidence === "high" ? "Strong match" : found.confidence === "medium" ? "Likely match" : "Possible match: please check"}</span>
        {found.headline && <p style={{ margin: 0 }}><b>{found.headline}</b>{found.location ? ` · ${found.location}` : ""}</p>}
        {found.summary && <p className="small" style={{ margin: 0 }}><Linkify text={found.summary} /></p>}
        {found.sources.length > 0 && <p className="small muted" style={{ margin: 0 }}>From public search results: {found.sources.map((s, i) => <span key={s}>{i ? ", " : ""}<a className="colink" href={s} target="_blank" rel="noreferrer noopener">{new URL(s).hostname.replace("www.", "")}</a></span>)}</p>}
        <p className="small muted" style={{ margin: 0 }}>Open the link to check it's really them before saving.</p>
        <div className="btns"><button type="button" className="btn primary" onClick={async () => { await onApply({ linkedinUrl: found.url!, background: found.summary, title: found.headline.split(/ at | @ /i)[0] }); setFound(null); }}>Yes, save this profile</button>
          <button type="button" className="btn ghost" onClick={() => setFound(null)}>Not them</button></div></>
        : <><h3 style={{ margin: 0 }}>No profile found</h3><p className="small">Couldn't find a LinkedIn profile that clearly matches {who.name}{who.company ? ` at ${who.company}` : ""}. Adding their title, company or email helps, or use Fill from LinkedIn to paste their profile link.</p>
          <div className="btns"><button type="button" className="btn" onClick={() => setFound(null)}>OK</button></div></>}
    </div></Modal>}
    {reading && <Modal open label="Fill from LinkedIn" onClose={() => setReading(false)}><div className="dlg li-dlg">
      <h3 style={{ margin: 0 }}>Fill from LinkedIn</h3>
      {!read && <div className="li-url"><label>Paste their profile link<input type="url" inputMode="url" placeholder="https://www.linkedin.com/in/their-name" value={link} onChange={(e) => setLink(e.target.value)} data-novoice /></label>
        <button type="button" className="btn primary" disabled={!/linkedin\.com\/in\//i.test(link) || !!busy} onClick={readUrl}>{busy === "url" ? "Looking it up…" : "Use this link"}</button></div>}
      <p className="small muted" style={{ margin: 0 }}>Or: on their LinkedIn profile, click <b>More → Save to PDF</b> and choose that file, or copy the whole profile page and paste it below.</p>
      {!read && <><label className="btn">📄 Choose LinkedIn PDF<input type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readIt(f); }} /></label>
        <textarea rows={6} placeholder="…or paste the profile text here" value={text} onChange={(e) => setText(e.target.value)} data-novoice />
        <div className="btns"><button type="button" className="btn primary" disabled={text.trim().length < 40 || !!busy} onClick={() => readIt()}>{busy === "read" ? "Reading…" : "Read profile"}</button><button type="button" className="btn ghost" onClick={() => setReading(false)}>Cancel</button></div></>}
      {read && <><div className="li-read">{([["name", "Name"], ["title", "Title"], ["company", "Company"], ["location", "Location"], ["email", "Email"], ["phone", "Phone"], ["linkedinUrl", "LinkedIn"]] as const).filter(([k]) => read[k]).map(([k, l]) => <div key={k}><span className="small muted">{l}</span><b>{read[k]}</b></div>)}</div>
        {read.background && <p className="small" style={{ margin: 0 }}><b>Background:</b> {read.background}</p>}
        <p className="small muted" style={{ margin: 0 }}>Only empty fields are filled. Nothing you've already entered is changed.</p>
        <div className="btns"><button type="button" className="btn primary" onClick={async () => { await onApply(read); setReading(false); }}>Fill in</button><button type="button" className="btn ghost" onClick={() => setRead(null)}>Back</button></div></>}
    </div></Modal>}
  </>;
}
