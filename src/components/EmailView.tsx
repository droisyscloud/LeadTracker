"use client";
import { useEffect, useRef, useState } from "react";
import type { ActivityDTO } from "@/lib/types";
import { api, useData } from "./data";

type Full = { note: string | null; body: string; html: string | null; from: string | null; to: string[]; cc: string[]; files: { id: string; name: string; contentType: string; size: number; url: string }[] };
const size = (n: number) => (!n ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const ext = (n: string) => (n.split(".").pop() || "file").slice(0, 4).toUpperCase();

/** Split a reply into what they wrote and the quoted earlier messages, so the new part is easy to read. */
function splitQuoted(text: string): [string, string] {
  const lines = text.split("\n");
  const i = lines.findIndex((l, k) => /^(On .{6,200}wrote:|-{2,} ?Original Message ?-{2,}|From: .+)$/i.test(l.trim()) || (l.startsWith(">") && lines.slice(k).filter((x) => x.trim()).every((x) => x.startsWith(">") || /wrote:$/.test(x))));
  return i > 0 ? [lines.slice(0, i).join("\n").trimEnd(), lines.slice(i).join("\n")] : [text, ""];
}

/** The original formatted email, isolated so nothing in it can run or affect the page. Remote images stay off until asked for. */
export function HtmlFrame({ html, images }: { html: string; images: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(200);
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src data: cid:${images ? " https: http:" : ""}; font-src data:`;
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank">
    <style>body{margin:0;padding:12px;font:14px/1.5 Arial,Helvetica,sans-serif;color:#111;background:#fff;word-wrap:break-word}img{max-width:100%;height:auto}table{max-width:100%}</style></head><body>${html}</body></html>`;
  const fit = () => { const d = ref.current?.contentDocument; if (d) setH(Math.min(1400, Math.max(120, d.documentElement.scrollHeight + 4))); };
  useEffect(() => { const t = setTimeout(fit, 300); return () => clearTimeout(t); });
  return <iframe ref={ref} title="Email" className="email-frame" style={{ height: h }} srcDoc={doc} onLoad={fit}
    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" />;
}

export function EmailView({ a }: { a: ActivityDTO }) {
  const { m, toast, reload } = useData();
  const [open, setOpen] = useState(false); const [full, setFull] = useState<Full | null>(null); const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"text" | "html">("text"); const [quoted, setQuoted] = useState(false); const [images, setImages] = useState(false);
  const known = new Map(m.contacts.filter((c) => c.email).map((c) => [c.email.toLowerCase(), c.name]));
  const team = new Map(m.users.map((u) => [u.email.toLowerCase(), u.name || u.email]));
  const who = (e: string) => { const n = known.get(e) || team.get(e); return n ? `${n} <${e}>` : e; };
  const load = async () => {
    if (full) { setOpen(!open); return; }
    setLoading(true);
    try {
      const r = await api<Full>(`/api/activities/${a.id}`); setFull(r); setOpen(true); if (r.html) setMode("html");
      if (r.note) toast(r.note, "info"); else if (a.preview) reload();
    }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't open the email.", "error"); }
    setLoading(false);
  };
  const text = open && full ? full.body : a.body;
  const [mainText, quotedText] = splitQuoted(text);
  const from = full?.from ?? a.emailFrom, to = full?.to ?? a.emailTo, cc = full?.cc ?? a.emailCc;
  const files = full ? full.files : [...a.files.map((f) => ({ ...f, url: `/api/files/${f.id}` })), ...a.mailFiles.map((f) => ({ ...f, url: `/api/email-attachments/${f.id}` }))];
  const expandable = a.truncated || a.hasHtml || !!quotedText || a.preview;
  return <div className="email">
    {(from || to.length > 0) && <dl className="email-h">
      {from && <><dt>From</dt><dd>{who(from)}</dd></>}
      {to.length > 0 && <><dt>To</dt><dd>{to.map(who).join(", ")}</dd></>}
      {cc.length > 0 && <><dt>Cc</dt><dd>{cc.map(who).join(", ")}</dd></>}
    </dl>}
    {open && full && mode === "html" && full.html ? <>
      <div className="inline small" style={{ gap: 12, margin: "6px 0" }}>
        <button className="linkbtn" onClick={() => setMode("text")}>Show as plain text</button>
        {!images && /<img[^>]+src=["']?https?:/i.test(full.html) && <button className="linkbtn" onClick={() => setImages(true)}>Show images</button>}
      </div>
      <HtmlFrame html={full.html} images={images} />
    </> : text ? <>
      <div className="body email-body">{mainText}{!open && a.truncated ? "…" : ""}</div>
      {quotedText && open && <><button className="linkbtn small" style={{ display: "block", marginTop: 6 }} onClick={() => setQuoted(!quoted)}>{quoted ? "Hide earlier messages" : "Show earlier messages in this thread"}</button>
        {quoted && <div className="body email-quoted">{quotedText}</div>}</>}
      {open && full?.html && <button className="linkbtn small" style={{ display: "block", marginTop: 4 }} onClick={() => setMode("html")}>Show original formatting</button>}
    </> : null}
    {files.length > 0 && <div className="email-files">{files.map((f) => <a key={f.id} className="att-file" href={f.url} target="_blank" rel="noopener" title={f.name}>
      <span className="att-ext">{ext(f.name)}</span><span><b>{f.name}</b><br /><span className="small muted">{size(f.size)}</span></span></a>)}</div>}
    {a.preview && !full && <p className="small muted" style={{ margin: "4px 0 0" }}>Saved as a short preview by an earlier version. Load it to see the whole email, who it went to and any attachments.</p>}
    {expandable && <button className="linkbtn small" onClick={load} disabled={loading} style={{ display: "block", marginTop: 6 }}>{loading ? (a.preview ? "Fetching from the mailbox…" : "Opening…") : open ? "Show less" : a.preview ? "Load full email" : "Show full email"}</button>}
  </div>;
}
