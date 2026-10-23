"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, useData } from "./data";
import { Linkify } from "./Linkify";

/* The ✨ assistant: ask anything about your work; it can propose actions, which only happen when you confirm. */
type Act = { tool: string; args: Record<string, unknown>; summary: string; status?: "new" | "done" | "cancelled" | "failed"; link?: string; error?: string };
type Msg = { role: "user" | "assistant"; content: string; actions?: Act[] };
const KEY = "lt-agent";
const SUGGEST = ["What's due today?", "Who should I follow up with?", "Summarize my open deals", "What's on my calendar this week?"];
function suggestFor(path: string, q: URLSearchParams, name: (id: string) => string | undefined): string[] {
  const id = q.get("id");
  if (path.startsWith("/contacts") && id && name(id)) { const n = name(id)!; return [`Summarize ${n}`, `Draft a follow-up email to ${n}`, `Create a task to call ${n} tomorrow`, `When did I last talk to ${n}?`]; }
  if (path.startsWith("/tasks")) return ["What's overdue?", "What's due this week?", "Which tasks have no due date?", "Create a task to send the proposal on Friday"];
  if (path.startsWith("/deals")) return ["Which deals close this month?", "Summarize my open deals", "Which deals have gone quiet?", "What's my biggest deal?"];
  if (path.startsWith("/calendar")) return ["What's on my calendar this week?", "What meetings do I have tomorrow?", "Who am I meeting today?", "What's due today?"];
  if (path.startsWith("/followups")) return ["Who should I follow up with first?", "Who haven't I contacted in two weeks?", "What's due today?", "Summarize my follow-ups"];
  if (path.startsWith("/notes")) return ["Summarize my notes from this week", "Who did I meet at the last event?", "What's due today?", "Who should I follow up with?"];
  return SUGGEST;
}
const asText = (x: Msg) => x.content + (x.actions?.length ? "\n" + x.actions.map((a) => `[${a.status === "done" ? "DONE" : a.status === "cancelled" ? "CANCELLED by the person" : a.status === "failed" ? "FAILED" : "WAITING for confirmation"}] ${a.summary}`).join("\n") : "");
export function Agent() {
  const { m, perms, reload } = useData(); const [open, setOpen] = useState(false); const [msgs, setMsgs] = useState<Msg[]>([]); const [text, setText] = useState(""); const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { try { const s = sessionStorage.getItem(KEY); if (s) setMsgs(JSON.parse(s)); } catch { /* fresh */ } }, []);
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-40))); } catch { /* full */ } end.current?.scrollIntoView({ block: "end" }); }, [msgs, open]);
  useEffect(() => { const h = () => setOpen(true); window.addEventListener("lt:agent", h); return () => window.removeEventListener("lt:agent", h); }, []);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".dict-bar")) setOpen(false); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [open]);
  if (!m.config.ai) return null;
  const ask = async (q: string) => { const t = q.trim(); if (!t || busy) return; const next = [...msgs, { role: "user" as const, content: t }]; setMsgs(next); setText(""); setBusy(true);
    try { const r = await api<{ reply: string; actions: Act[] }>("/api/agent", { json: { messages: next.map((x) => ({ role: x.role, content: asText(x) })) } });
      setMsgs([...next, { role: "assistant", content: r.reply, actions: r.actions.map((a) => ({ ...a, status: "new" })) }]); }
    catch (e) { setMsgs([...next, { role: "assistant", content: e instanceof Error ? e.message : "Something went wrong. Try again." }]); }
    setBusy(false); };
  const setAct = (mi: number, ai: number, patch: Partial<Act>) => setMsgs((xs) => xs.map((x, i) => (i !== mi ? x : { ...x, actions: x.actions!.map((a, j) => (j === ai ? { ...a, ...patch } : a)) })));
  const confirm = async (mi: number, ai: number) => { const a = msgs[mi].actions![ai]; setAct(mi, ai, { status: "done", error: undefined });
    try { const r = await api<{ link: string }>("/api/agent/act", { json: { tool: a.tool, args: a.args } }); setAct(mi, ai, { status: "done", link: r.link }); reload(); }
    catch (e) { setAct(mi, ai, { status: "failed", error: e instanceof Error ? e.message : "Couldn't do that." }); } };
  return <>
    {!open && <Bubble onOpen={() => setOpen(true)} />}
    {open && <section className="agent" role="dialog" aria-label="Assistant">
      <header className="agent-h"><b>✨ Assistant</b><span className="small muted">Looks things up; asks before doing anything</span>
        <span className="agent-hb">{msgs.length > 0 && <button type="button" className="linkbtn small" onClick={() => setMsgs([])}>New chat</button>}<button type="button" className="linkbtn" onClick={() => setOpen(false)} aria-label="Close the assistant">✕</button></span></header>
      <div className="agent-body">
        {!msgs.length && <div className="agent-empty"><p className="small muted" style={{ margin: 0 }}>Ask about your leads, tasks, follow-ups, deals, meetings or notes. Ask me to do things too, like create a task, log a call, move a stage or send an email; I'll show you exactly what I'll do and wait for you to confirm.</p>
          <div className="agent-sug">{suggestFor(location.pathname, new URLSearchParams(location.search), (id) => m.contactMap.get(id)?.name).map((s) => <button key={s} type="button" className="chip" onClick={() => ask(s)}>{s}</button>)}</div></div>}
        {msgs.map((x, mi) => <div key={mi} className={"agent-m " + x.role}>
          <div className="agent-bub"><Linkify text={x.content} /></div>
          {x.actions?.map((a, ai) => <div key={ai} className={"agent-act s-" + a.status}>
            <span>{a.status === "done" ? "✓ " : a.status === "cancelled" ? "✕ " : a.status === "failed" ? "⚠ " : "→ "}{a.summary}</span>
            {a.status === "new" ? (perms.write ? <span className="btns"><button type="button" className="btn sm primary" onClick={() => confirm(mi, ai)}>Confirm</button><button type="button" className="btn sm ghost" onClick={() => setAct(mi, ai, { status: "cancelled" })}>Cancel</button></span> : <span className="small muted">You can view only, so I can't do this for you.</span>)
              : a.status === "done" ? (a.link ? <Link className="colink small" href={a.link} onClick={() => { if (window.innerWidth <= 900) setOpen(false); }}>Done · Open</Link> : <span className="small muted">Done</span>)
              : a.status === "failed" ? <span className="small" style={{ color: "var(--cold)" }}>{a.error}</span> : <span className="small muted">Cancelled</span>}</div>)}
          {(x.actions?.filter((a) => a.status === "new").length || 0) > 1 && perms.write && <button type="button" className="btn sm" onClick={() => x.actions!.forEach((a, ai) => a.status === "new" && confirm(mi, ai))}>Confirm all</button>}
        </div>)}
        {busy && <div className="agent-m assistant"><div className="agent-bub muted">Thinking…</div></div>}
        <div ref={end} />
      </div>
      <form className="agent-in" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <textarea rows={1} value={text} onChange={(e) => { setText(e.target.value); e.target.style.height = "44px"; e.target.style.height = Math.min(140, e.target.scrollHeight) + "px"; }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(text); } }} placeholder="Ask or tell me what to do…" aria-label="Message the assistant" />
        <button type="submit" className="btn primary" disabled={!text.trim() || busy} aria-label="Send">➤</button></form>
    </section>}
  </>;
}

/** The floating ✨ bubble: drag it anywhere; it snaps to the nearest side and remembers where you left it. Tap to open. */
const POS = "lt-agent-pos";
function Bubble({ onOpen }: { onOpen: () => void }) {
  const [pos, setPos] = useState<{ side: "l" | "r"; y: number } | null>(null); const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null); const [, tick] = useState(0);
  const [scrolling, setScrolling] = useState(false);   // fades while you scroll, so it never hides what you're reading
  // while anything is being dragged (a task onto a calendar day, a deal to another stage), the bubble gets out of the way
  useEffect(() => { const on = () => document.body.classList.add("dragging-any"); const off = () => document.body.classList.remove("dragging-any");
    window.addEventListener("dragstart", on); window.addEventListener("dragend", off); window.addEventListener("drop", off);
    return () => { window.removeEventListener("dragstart", on); window.removeEventListener("dragend", off); window.removeEventListener("drop", off); }; }, []);
  useEffect(() => { let t: ReturnType<typeof setTimeout>; const f = () => { setScrolling(true); clearTimeout(t); t = setTimeout(() => setScrolling(false), 700); };
    window.addEventListener("scroll", f, { passive: true, capture: true }); return () => { window.removeEventListener("scroll", f, { capture: true } as EventListenerOptions); clearTimeout(t); }; }, []);
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem(POS) || "null"); if (s && (s.side === "l" || s.side === "r") && typeof s.y === "number") setPos(s); } catch { /* default */ }
    const f = () => tick((n) => n + 1); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  if (typeof window === "undefined") return null;
  const W = window.innerWidth, H = window.innerHeight, small = W <= 900, S = small ? 48 : 56;
  const tuck = small ? 10 : 12;   // floats just off the edge
  const minY = small ? 76 : 84, maxY = H - (small ? 84 : 90) - S;   // phones: level with the + button (just above the bottom tabs), over the empty space pages leave there
  const y = Math.min(maxY, Math.max(minY, pos ? pos.y * H : maxY));   // starts just above the + button, out of the way of list rows
  const side = pos?.side ?? (small ? "l" : "r");   // phones: starts bottom-left (list rows keep their dates and buttons on the right)
  const style: React.CSSProperties = drag ? { left: drag.x - S / 2, top: drag.y - S / 2 } : { top: y, ...(side === "l" ? { left: tuck } : { right: tuck }) };
  return <button type="button" className={"agent-bubble" + (drag ? " dragging" : "") + (scrolling && !drag ? " fading" : "")} style={{ ...style, width: S, height: S }} aria-label="Open the assistant" title="Ask the assistant (drag to move)"
    onPointerDown={(e) => { start.current = { x: e.clientX, y: e.clientY, moved: false }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
    onPointerMove={(e) => { const s = start.current; if (!s) return; if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 6) return; s.moved = true; setDrag({ x: e.clientX, y: e.clientY }); }}
    onPointerUp={(e) => { const s = start.current; start.current = null; if (!s) return;
      if (!s.moved) { onOpen(); return; }
      const p = { side: (e.clientX < W / 2 ? "l" : "r") as "l" | "r", y: Math.min(maxY, Math.max(minY, e.clientY - S / 2)) / H }; setPos(p); setDrag(null); try { localStorage.setItem(POS, JSON.stringify(p)); } catch { /* ignore */ } }}
    onPointerCancel={() => { start.current = null; setDrag(null); }}
    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}><span aria-hidden="true">✨</span></button>;
}
