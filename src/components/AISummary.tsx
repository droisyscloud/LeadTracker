"use client";
import { useRef, useCallback, useEffect, useState } from "react";
import { api, useData } from "./data";
import { ago } from "./model";
import { Linkify } from "./Linkify";

type Summary = { headline: string; points: string[]; risks: string[]; actions: string[]; generatedAt: number; cached: boolean; stale: boolean };
const LABEL = { dashboard: "the pipeline", team: "this team", contact: "this lead", company: "this account" } as const;

/** AI summary card. Shows the last saved summary right away; generating a new one is one click. */
export function AISummary({ scope, id, className = "" }: { scope: keyof typeof LABEL; id?: string | null; className?: string }) {
  const { m } = useData();
  const [s, setS] = useState<Summary | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [loaded, setLoaded] = useState(false);
  const autoRef = useRef(false);
  useEffect(() => { if (s?.stale && !autoRef.current) { autoRef.current = true; load("refresh"); } });   // out of date: rewrite it once, by itself
  const load = useCallback(async (mode: "peek" | "make" | "refresh") => {
    setErr(""); if (mode !== "peek") setBusy(true);
    try { const r = await api<{ summary: Summary | null }>("/api/ai/summary", { json: { scope, id: id || null, peek: mode === "peek", refresh: mode === "refresh" } }); setS(r.summary); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not summarise."); }
    setBusy(false); setLoaded(true);
  }, [scope, id]);
  useEffect(() => { if (m.config.ai) load("peek"); }, [load, m.config.ai]);
  // minimised or not, remembered on this device for each kind of page
  const key = `lt-ai-min:${scope}`;
  const [min, setMin] = useState(false);
  useEffect(() => { try { setMin(localStorage.getItem(key) === "1"); } catch { /* storage blocked */ } }, [key]);
  const toggle = () => { const v = !min; setMin(v); try { localStorage.setItem(key, v ? "1" : "0"); } catch { /* ignore */ } };
  if (!m.config.ai) return m.me.role === "admin" && scope === "dashboard" ? <section className={"panel ai " + className}><header><div><h2>AI summary</h2><p className="muted small">Turn on AI summaries by setting OPENAI_API_KEY or ANTHROPIC_API_KEY on the server.</p></div></header></section> : null;
  if (min) return <section className={"panel ai ai-min " + className}>
    <button type="button" className="ai-min-bar" onClick={toggle} aria-expanded="false" title="Show the AI summary">
      <span className="ai-mark" aria-hidden="true">✦</span> <b>AI summary</b> <span className="muted ai-min-h">{s?.headline || "Hidden"}</span><span className="linkbtn small">Show</span>
    </button>
  </section>;
  return <section className={"panel ai " + className} aria-busy={busy}>
    <header><div><h2><span className="ai-mark" aria-hidden="true">✦</span> AI summary of {LABEL[scope]}</h2>
      <p className="muted small">{s ? `Generated ${ago(s.generatedAt)}${s.stale ? ", data has changed since" : ""}. Written by AI from the data here, so check before acting.` : "A short read on what matters, what is slipping and what to do next."}</p></div>
      <div className="inline" style={{ gap: 6, flex: "none" }}><button className="btn" disabled={busy} onClick={() => load(s ? "refresh" : "make")}>{busy ? "Thinking…" : s ? "Refresh" : "Summarise"}</button>
        <button type="button" className="btn ghost" onClick={toggle} aria-expanded="true" title="Minimise the AI summary">Minimize</button></div></header>
    {err && <div className="banner" style={{ margin: 0, borderColor: "var(--cold)" }}>{err}</div>}
    {busy && !s && <div className="ai-skeleton"><i /><i /><i /></div>}
    {s && <div className="ai-body" style={busy ? { opacity: 0.5 } : undefined}>
      {s.headline && <p className="ai-headline">{s.headline}</p>}
      <div className="ai-cols">
        {s.points.length > 0 && <div><h3>What we know</h3><ul>{s.points.map((x, i) => <li key={i}><Linkify text={x} /></li>)}</ul></div>}
        {s.risks.length > 0 && <div><h3>Watch out</h3><ul className="risk">{s.risks.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
        {s.actions.length > 0 && <div><h3>Do next</h3><ol>{s.actions.map((x, i) => <li key={i}><Linkify text={x} /></li>)}</ol></div>}
      </div>
    </div>}
    {!s && !busy && loaded && !err && <p className="empty">No summary yet.</p>}
  </section>;
}
