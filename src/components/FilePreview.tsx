"use client";
import { useEffect, useRef, useState } from "react";

/* Attachments open in a full preview over the page instead of a new tab. Ctrl/Cmd-click still opens a new tab. */
const FILE = /^\/api\/((files|email-attachments)\/[\w-]+|[\w/-]+\/(file|pdf|attachment))$/;
type Doc = { url: string; name: string };
type View = { kind: "image" | "pdf" | "video" | "audio" | "text" | "csv" | "html" | "sheet" | "office" | "none" | "error"; src?: string; text?: string; rows?: string[][]; sheets?: { name: string; rows: string[][] }[]; msg?: string };
const extOf = (n: string) => (n.toLowerCase().match(/\.([a-z0-9]+)(?:$|\?)/)?.[1] || "");
function csvRows(t: string): string[][] { const out: string[][] = []; let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { row.push(cur); cur = ""; } else if (ch === "\n") { row.push(cur.replace(/\r$/, "")); out.push(row); row = []; cur = ""; } else cur += ch; }
  if (cur || row.length) { row.push(cur); out.push(row); } return out.slice(0, 2000); }
export function FilePreview() {
  const [doc, setDoc] = useState<Doc | null>(null); const [view, setView] = useState<View | null>(null); const [blobUrl, setBlobUrl] = useState(""); const [sheet, setSheet] = useState(0); const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null; if (!a || a.hasAttribute("download") || a.dataset.nopreview !== undefined) return;
      const u = new URL(a.href, location.href); if (u.origin !== location.origin || !FILE.test(u.pathname) || u.searchParams.get("download") === "1") return;
      e.preventDefault(); setDoc({ url: u.pathname + u.search, name: (a.getAttribute("title") || a.textContent || "").trim() });
    };
    document.addEventListener("click", h, true); return () => document.removeEventListener("click", h, true);
  }, []);
  useEffect(() => {
    if (!doc) return; let cancelled = false; setView(null); setSheet(0); setBusy(true);
    (async () => {
      try {
        const r = await fetch(doc.url, { credentials: "same-origin" }); if (!r.ok) throw new Error(r.status === 404 ? "This file isn't available any more, or you can't open it." : "Couldn't open this file.");
        const cd = r.headers.get("content-disposition") || ""; const fname = decodeURIComponent(cd.match(/filename\*=UTF-8''([^;]+)/i)?.[1] || cd.match(/filename="?([^";]+)"?/i)?.[1] || "") || doc.name || "file";
        const blob = await r.blob(); const type = (r.headers.get("content-type") || blob.type || "").split(";")[0]; const ext = extOf(fname) || extOf(doc.url);
        if (cancelled) return; const url = URL.createObjectURL(blob); setBlobUrl(url); setDoc((d) => (d ? { ...d, name: fname } : d));
        if (type.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "heic"].includes(ext)) return setView({ kind: "image", src: url });
        if (type === "application/pdf" || ext === "pdf") return setView({ kind: "pdf", src: URL.createObjectURL(new Blob([blob], { type: "application/pdf" })) });
        if (type.startsWith("video/") || ["mp4", "webm", "mov"].includes(ext)) return setView({ kind: "video", src: url });
        if (type.startsWith("audio/") || ["mp3", "m4a", "wav", "ogg"].includes(ext)) return setView({ kind: "audio", src: url });
        if (ext === "csv" || type === "text/csv") return setView({ kind: "csv", rows: csvRows(await blob.text()) });
        if (type.startsWith("text/") || ["txt", "md", "json", "log", "xml", "eml"].includes(ext)) return setView({ kind: "text", text: (await blob.text()).slice(0, 500000) });
        if (ext === "xlsx" || ext === "xlsm") { const ExcelJS = (await import("exceljs")).default; const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await blob.arrayBuffer());
          const sheets = wb.worksheets.slice(0, 20).map((ws) => { const rows: string[][] = []; ws.eachRow({ includeEmpty: false }, (row) => { if (rows.length < 1000) rows.push((row.values as unknown[]).slice(1).map((v) => v == null ? "" : v instanceof Date ? v.toLocaleDateString() : typeof v === "object" ? String((v as { text?: string; result?: unknown }).text ?? (v as { result?: unknown }).result ?? "") : String(v))); }); return { name: ws.name, rows }; });
          return setView({ kind: "sheet", sheets }); }
        if (ext === "docx") { const mammoth = await import("mammoth/mammoth.browser"); const out = await (mammoth as unknown as { convertToHtml: (o: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> }).convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
          return setView({ kind: "html", text: `<!doctype html><html><head><meta charset="utf-8"><style>body{font:15px/1.55 system-ui,sans-serif;max-width:820px;margin:24px auto;padding:0 20px;color:#111}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style></head><body>${out.value}</body></html>` }); }
        if (["pptx", "ppt", "doc", "xls", "ppsx"].includes(ext)) {
          if (/^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname)) return setView({ kind: "none", msg: "PowerPoint previews use Microsoft's Office viewer, which works on the live site (not on this test copy). Download it to view here." });
          const j = await fetch("/api/preview-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: doc.url }) }).then((x) => x.json());
          if (!j.url) throw new Error(j.error || "Couldn't prepare the preview."); return setView({ kind: "office", src: `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(j.url)}` }); }
        setView({ kind: "none", msg: "There's no preview for this kind of file. Download it to open it." });
      } catch (e) { if (!cancelled) setView({ kind: "error", msg: e instanceof Error ? e.message : "Couldn't open this file." }); }
      finally { if (!cancelled) setBusy(false); }
    })();
    return () => { cancelled = true; };
  }, [doc?.url]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const d = ref.current; if (d && doc && !d.open) d.showModal(); }, [doc]);
  const close = () => { setDoc(null); setView(null); if (blobUrl) URL.revokeObjectURL(blobUrl); setBlobUrl(""); };
  const Table = ({ rows }: { rows: string[][] }) => <div className="fp-tbl"><table><tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => i === 0 ? <th key={j}>{c}</th> : <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>;
  // the window only exists while a file is being viewed
  if (!doc) return null;
  return <dialog ref={ref} className="fp" onCancel={(e) => { e.preventDefault(); if (e.target === e.currentTarget) close(); }} aria-label="File preview">
    {<div className="fp-wrap">
      <div className="fp-bar"><b className="fp-name" title={doc.name}>{doc.name || "File"}</b>
        <div className="fp-act">{blobUrl && <a className="btn sm" href={blobUrl} download={doc.name || "file"}>⬇ Download</a>}<a className="btn sm ghost" href={doc.url} target="_blank" rel="noreferrer" data-nopreview>Open in new tab</a>
          <button type="button" className="btn sm" onClick={close} aria-label="Close preview">✕ Close</button></div></div>
      <div className="fp-body">
        {busy && !view && <p className="muted fp-msg">Opening…</p>}
        {view?.kind === "image" && <img src={view.src} alt={doc.name} className="fp-img" />}
        {(view?.kind === "pdf" || view?.kind === "office") && <iframe src={view.src} title={doc.name} className="fp-frame" />}
        {view?.kind === "html" && <iframe srcDoc={view.text} sandbox="" title={doc.name} className="fp-frame fp-light" />}
        {view?.kind === "video" && <video src={view.src} controls className="fp-img" />}
        {view?.kind === "audio" && <audio src={view.src} controls style={{ width: "min(560px, 90%)", margin: "40px auto", display: "block" }} />}
        {view?.kind === "text" && <pre className="fp-text">{view.text}</pre>}
        {view?.kind === "csv" && view.rows && <Table rows={view.rows} />}
        {view?.kind === "sheet" && view.sheets && <>{view.sheets.length > 1 && <div className="quick fp-tabs">{view.sheets.map((s, i) => <button key={i} type="button" className="chip" aria-pressed={i === sheet} onClick={() => setSheet(i)}>{s.name}</button>)}</div>}
          <Table rows={view.sheets[sheet]?.rows || []} /></>}
        {(view?.kind === "none" || view?.kind === "error") && <p className="fp-msg">{view.msg}</p>}
      </div></div>}
  </dialog>;
}
