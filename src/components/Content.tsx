"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { api, useData } from "./data";

type Doc = { id: string; name: string; pages: number; kind?: "file" | "link"; fileType?: string; fileName?: string; url?: string; size: number; createdById: string | null; createdAt: number; links: number; opens: number; seconds: number; pageTime: Record<string, number>;
  viewers: { contactId: string | null; at: number; seconds: number; pagesRead: number }[] };
const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`);

/** The content library: documents, how they're read, and links to share. */
export function ContentView() {
  const { m, run, toast, perms } = useData();
  const { data, mutate } = useSWR<{ content: Doc[] }>("/api/content", (u: string) => api<{ content: Doc[] }>(u));

  const [adding, setAdding] = useState<File[] | null>(null);
  const general = async (d: Doc) => { const r = await run(() => api<{ url: string }>(`/api/content/${d.id}/link`, { json: { contactId: null } })); if (r) navigator.clipboard?.writeText(r.url).then(() => toast("General link copied (opens aren't tied to a lead)"), () => undefined); };
  return <div className="dir" onDragOver={(e) => { if (perms.write && e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
    onDrop={(e) => { if (!perms.write || !e.dataTransfer.files.length || (e.target as HTMLElement).closest(".ac-drop")) return; e.preventDefault(); setAdding([...e.dataTransfer.files]); }}>
    <div className="dir-head"><div className="dir-count"><b className="num">{data?.content.length ?? "…"}</b><span>{data?.content.length === 1 ? "item" : "items"}</span></div>
      {perms.write && <div className="dir-tools"><button className="btn primary" onClick={() => setAdding(adding ? null : [])}>+ Add content</button></div>}</div>
    {perms.write && adding && <AddContent initial={adding} onClose={() => setAdding(null)} onAdded={() => mutate()} />}
    <p className="small muted" style={{ margin: 0 }}>Add any kind of content: PDFs, PowerPoint, Word, Excel, images, videos, audio, or a link (a web page, YouTube, Vimeo, Loom, Google Drive). Share brochures, case studies and decks through tracked links: you'll see who opened them, which pages they read and for how long. On a lead, use 🔗 Insert tracked link when writing an email.</p>
    {!data ? <p className="empty">Loading…</p> : !data.content.length ? <p className="empty">No documents yet. Add a PDF to start.</p>
      : <div className="cards content-cards">{data.content.map((d) => { const max = Math.max(1, ...Object.values(d.pageTime));
        return <section key={d.id} className="panel doc-card">
          <div className="rc-head"><div><b>{typeIcon(d)} {d.name}</b><div className="small muted">{typeLabel(d)} · added {new Date(d.createdAt).toLocaleDateString()}</div></div></div>
          <div className="oc-nums"><span><small>Opens</small><b className="num">{d.opens}</b></span><span><small>Reading time</small><b>{dur(d.seconds)}</b></span><span><small>Avg per open</small><b>{d.opens ? dur(Math.round(d.seconds / d.opens)) : "—"}</b></span></div>
          {d.opens > 0 && isPdfDoc(d) && <div className="page-heat" role="img" aria-label="Time on each page">{Array.from({ length: d.pages }, (_, i) => { const s = d.pageTime[String(i + 1)] || 0;
            return <span key={i} title={`Page ${i + 1}: ${dur(s)}`}><i style={{ height: `${Math.max(s ? 8 : 2, (s / max) * 100)}%` }} /><small>{i + 1}</small></span>; })}</div>}
          {d.viewers.length > 0 && <ul className="doc-viewers">{d.viewers.slice(0, 5).map((v, i) => { const c = v.contactId ? m.contactMap.get(v.contactId) : null;
            return <li key={i}>{c ? <Link className="colink" href={`/contacts?id=${c.id}`}>{c.name}</Link> : <span className="muted">Someone with the general link</span>} <span className="small muted">· {new Date(v.at).toLocaleDateString()} · {v.pagesRead} page{v.pagesRead === 1 ? "" : "s"}, {dur(v.seconds)}</span></li>; })}</ul>}
          <div className="rc-act"><button className="linkbtn small" onClick={() => general(d)}>Copy general link</button>{(perms.manage || d.createdById === m.me.id) && <button className="linkbtn small" style={{ color: "var(--muted)" }} onClick={() => { if (confirm(`Remove "${d.name}"? Links to it will stop working.`)) run(() => api(`/api/content/${d.id}`, { method: "DELETE" }), "Document removed").then(() => mutate()); }}>Remove</button>}</div>
        </section>; })}</div>}
  </div>;
}

/** In the email form: pick a document and insert this lead's tracked link. */
export function InsertContentLink({ contactId, onInsert }: { contactId: string; onInsert: (text: string) => void }) {
  const { run } = useData();
  const [open, setOpen] = useState(false);
  const { data } = useSWR<{ content: Doc[] }>(open ? "/api/content" : null, (u: string) => api<{ content: Doc[] }>(u));
  const pick = async (d: Doc) => { const r = await run(() => api<{ url: string; name: string }>(`/api/content/${d.id}/link`, { json: { contactId } })); if (r) { onInsert(`${r.name}: ${r.url}`); setOpen(false); } };
  return <span className="ins-link"><button type="button" className="btn ghost sm" onClick={() => setOpen(!open)}>🔗 Insert tracked link</button>
    {open && <div className="ins-menu" role="menu">{!data ? <p className="small muted" style={{ margin: 8 }}>Loading…</p> : data.content.length ? data.content.map((d) => <button key={d.id} type="button" role="menuitem" onClick={() => pick(d)}>📄 {d.name} <span className="small muted">· {d.pages} p</span></button>)
      : <p className="small muted" style={{ margin: 8 }}>No content yet. Add files or links on the <Link className="colink" href="/content">Content</Link> page.</p>}</div>}</span>;
}

/** The viewer people see when they open a tracked link: the pages, and quiet reporting of what's read. */
export function DocViewer({ token }: { token: string }) {
  const [meta, setMeta] = useState<Meta | null>(null); const [err, setErr] = useState(""); const [cur, setCur] = useState(1);
  const holder = useRef<HTMLDivElement>(null); const view = useRef<string | null>(null); const curRef = useRef(1);
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const mr = await fetch(`/api/public/content/${token}?meta=1`); const mj = await mr.json(); if (!mr.ok) throw new Error(mj.error); if (dead) return; setMeta(mj);
        if (mj.kind === "link" || (mj.fileType && mj.fileType !== "application/pdf")) return;   // shown below, not as PDF pages
        const pdfjs = await import("pdfjs-dist"); pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        const doc = await pdfjs.getDocument({ url: `/api/public/content/${token}` }).promise;
        const width = Math.min(900, (holder.current?.clientWidth || 800));
        for (let i = 1; i <= doc.numPages && !dead; i++) {
          const page = await doc.getPage(i); const base = page.getViewport({ scale: 1 }); const scale = width / base.width; const vp = page.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
          const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height; c.style.width = `${width}px`; c.style.height = `${(vp.height / vp.width) * width}px`; c.dataset.page = String(i); c.className = "dv-page";
          holder.current?.appendChild(c); await page.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport: vp }).promise;
        }
      } catch (e) { setErr(e instanceof Error ? e.message : "This document couldn't be opened."); }
    })();
    return () => { dead = true; };
  }, [token]);
  // which page is on screen
  useEffect(() => {
    const io = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]; if (v) { const p = Number((v.target as HTMLElement).dataset.page); curRef.current = p; setCur(p); } }, { threshold: [0.3, 0.6, 0.9] });
    const mo = new MutationObserver(() => holder.current?.querySelectorAll("canvas").forEach((c) => io.observe(c)));
    if (holder.current) mo.observe(holder.current, { childList: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, []);
  // report reading every 5 seconds, only while the page is visible
  useEffect(() => {
    if (!meta) return;
    const send = (seconds: number) => fetch(`/api/public/content/${token}/view`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ viewId: view.current, page: curRef.current, seconds }) })
      .then((r) => r.json()).then((j) => { if (j.viewId) view.current = j.viewId; }).catch(() => undefined);
    send(0);
    const t = setInterval(() => { if (document.visibilityState === "visible") send(5); }, 5000);
    return () => clearInterval(t);
  }, [meta, token]);
  const isPdf = !!meta && meta.kind !== "link" && (!meta.fileType || meta.fileType === "application/pdf");
  return <main className="docview"><header><img src="/api/public/brand/logo" alt="Logo" className="logo" /><div><h1>{meta?.name || "Document"}</h1>{meta && isPdf && <p className="muted">Page {cur} of {meta.pages}</p>}</div></header>
    {err ? <p className="empty">This link isn't available. It may have been removed.</p> : meta && !isPdf ? <OtherContent token={token} meta={meta} /> : <div ref={holder} className="dv-pages" />}
  </main>;
}

type Meta = { name: string; pages: number; kind?: "file" | "link"; fileType?: string; fileName?: string; url?: string };
/** Video sites that can play right in the page. */
function embedFor(url: string): string | null {
  const u = (() => { try { return new URL(url); } catch { return null; } })(); if (!u) return null; const h = u.hostname.replace(/^www\./, "");
  const yt = h === "youtu.be" ? u.pathname.slice(1) : h.endsWith("youtube.com") ? (u.searchParams.get("v") || u.pathname.match(/\/(?:shorts|embed)\/([\w-]+)/)?.[1]) : null;
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt}`;
  const vm = h === "vimeo.com" ? u.pathname.match(/\/(\d+)/)?.[1] : null; if (vm) return `https://player.vimeo.com/video/${vm}`;
  const lm = h.endsWith("loom.com") ? u.pathname.match(/\/share\/([\w-]+)/)?.[1] : null; if (lm) return `https://www.loom.com/embed/${lm}`;
  const gd = h === "drive.google.com" ? u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] : null; if (gd) return `https://drive.google.com/file/d/${gd}/preview`;
  return null;
}
/** Anything that isn't a PDF: shown in the page where possible; time is tracked the same way. */
function OtherContent({ token, meta }: { token: string; meta: Meta }) {
  const file = `/api/public/content/${token}`; const t = meta.fileType || ""; const ext = (meta.fileName || "").toLowerCase().split(".").pop() || "";
  const [go, setGo] = useState(false);
  useEffect(() => { if (meta.kind === "link" && meta.url && !embedFor(meta.url)) { const x = setTimeout(() => { setGo(true); window.location.href = meta.url!; }, 1500); return () => clearTimeout(x); } }, [meta]);
  if (meta.kind === "link") { const em = meta.url ? embedFor(meta.url) : null;
    return em ? <div className="dv-embed"><iframe src={em} title={meta.name} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen /></div>
      : <div className="dv-other"><p>{go ? "Opening…" : "Taking you there…"}</p><a className="btn primary" href={meta.url}>Open {meta.name}</a></div>; }
  if (t.startsWith("image/")) return <div className="dv-other"><img src={file} alt={meta.name} className="dv-img" /></div>;
  if (t.startsWith("video/")) return <div className="dv-other"><video src={file} controls playsInline className="dv-img" /></div>;
  if (t.startsWith("audio/")) return <div className="dv-other"><audio src={file} controls style={{ width: "min(560px, 100%)" }} /></div>;
  if (["pptx", "ppt", "ppsx", "docx", "doc", "xlsx", "xls"].includes(ext)) {
    const local = typeof window !== "undefined" && /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);
    if (!local) return <div className="dv-embed tall"><iframe src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(`${location.origin}${file}/f/${encodeURIComponent(meta.fileName || "file")}`)}`} title={meta.name} allowFullScreen /></div>;
  }
  return <div className="dv-other"><p>{meta.fileName || meta.name}</p><a className="btn primary" href={file} download={meta.fileName || meta.name}>⬇ Download</a></div>;
}

const isPdfDoc = (d: { kind?: string; fileType?: string }) => d.kind !== "link" && (!d.fileType || d.fileType === "application/pdf");
function typeIcon(d: { kind?: string; fileType?: string; url?: string }) {
  if (d.kind === "link") return /youtu|vimeo|loom/.test(d.url || "") ? "🎬" : "🔗"; const t = d.fileType || "application/pdf";
  return t === "application/pdf" ? "📄" : t.startsWith("image/") ? "🖼️" : t.startsWith("video/") ? "🎬" : t.startsWith("audio/") ? "🎧" : /presentation|powerpoint/.test(t) ? "📊" : /spreadsheet|excel|csv/.test(t) ? "📈" : /word/.test(t) ? "📝" : "📎";
}
function typeLabel(d: { kind?: string; fileType?: string; fileName?: string; pages: number; url?: string }) {
  if (d.kind === "link") { try { return `Link · ${new URL(d.url || "").hostname.replace(/^www\./, "")}`; } catch { return "Link"; } }
  if (isPdfDoc(d)) return `PDF · ${d.pages} page${d.pages === 1 ? "" : "s"}`;
  const ext = (d.fileName || "").split(".").pop()?.toUpperCase(); return ext || "File";
}

/** The Add content panel: files (drop or choose, several at once, each named) or a link. */
const nice = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const baseName = (f: string) => f.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
function AddContent({ initial, onClose, onAdded }: { initial: File[]; onClose: () => void; onAdded: () => void }) {
  const { toast } = useData(); const [tab, setTab] = useState<"file" | "link">("file"); const pick = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<{ f: File; name: string }[]>(() => initial.map((f) => ({ f, name: baseName(f.name) })));
  const [url, setUrl] = useState(""); const [lname, setLname] = useState(""); const [lnameTouched, setLnameTouched] = useState(false);
  const addFiles = (fs: FileList | File[] | null) => { if (fs) setItems((x) => [...x, ...[...fs].map((f) => ({ f, name: baseName(f.name) }))]); };
  const host = (u: string) => { try { return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, ""); } catch { return ""; } };
  const save = async () => {
    setBusy(true); let ok = 0;
    try {
      if (tab === "file") for (const it of items) { const fd = new FormData(); fd.append("file", it.f); fd.append("name", it.name.trim());
        try { await api("/api/content", { form: fd }); ok++; } catch (e) { toast(`${it.f.name}: ${e instanceof Error ? e.message : "couldn't add it"}`, "error"); } }
      else { const fd = new FormData(); fd.append("url", url.trim()); fd.append("name", lname.trim()); await api("/api/content", { form: fd }); ok = 1; }
      if (ok) { toast(ok === 1 ? "Added to Content" : `${ok} items added to Content`); onAdded(); onClose(); }
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't add it", "error"); } finally { setBusy(false); }
  };
  const ready = tab === "file" ? items.length > 0 && items.every((i) => i.name.trim()) : !!host(url);
  return <section className="panel ac" aria-label="Add content">
    <div className="ac-head"><h3 style={{ margin: 0 }}>Add content</h3><button type="button" className="linkbtn" onClick={onClose} aria-label="Close">✕</button></div>
    <div className="quick" role="tablist"><button type="button" role="tab" className="chip" aria-pressed={tab === "file"} onClick={() => setTab("file")}>📎 File</button><button type="button" role="tab" className="chip" aria-pressed={tab === "link"} onClick={() => setTab("link")}>🔗 Link</button></div>
    {tab === "file" ? <>
      <button type="button" className="ac-drop" onClick={() => pick.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
        <b>Drop files here, or click to choose</b><span className="small muted">PDF, PowerPoint, Word, Excel, images, video, audio and more · up to 50 MB each</span></button>
      <input ref={pick} type="file" multiple hidden aria-label="Choose files" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      {items.length > 0 && <ul className="ac-list">{items.map((it, i) => <li key={i}>
        <span className="ac-ic" aria-hidden="true">{typeIcon({ fileType: it.f.type || (it.f.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "") , kind: "file" })}</span>
        <label className="ac-name"><span className="small muted">{it.f.name} · {nice(it.f.size)}</span><input type="text" value={it.name} onChange={(e) => setItems((x) => x.map((y, k) => (k === i ? { ...y, name: e.target.value } : y)))} aria-label={`Name for ${it.f.name}`} placeholder="Name people will see" /></label>
        <button type="button" className="linkbtn" onClick={() => setItems((x) => x.filter((_, k) => k !== i))} aria-label={`Remove ${it.f.name}`}>✕</button></li>)}</ul>}
    </> : <div className="ac-linkf">
      <label>Link<input type="url" value={url} autoFocus onChange={(e) => { setUrl(e.target.value); if (!lnameTouched) setLname(host(e.target.value)); }} placeholder="https://… web page, YouTube, Vimeo, Loom or Google Drive" /></label>
      <label>Name<input type="text" value={lname} onChange={(e) => { setLname(e.target.value); setLnameTouched(true); }} placeholder="Name people will see" /></label></div>}
    <div className="btns"><button type="button" className="btn primary" disabled={!ready || busy} onClick={save}>{busy ? "Adding…" : tab === "file" && items.length > 1 ? `Add ${items.length} to Content` : "Add to Content"}</button><button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
  </section>;
}
