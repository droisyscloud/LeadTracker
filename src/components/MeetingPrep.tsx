"use client";
import { useEffect, useState } from "react";
import type { ContactDTO } from "@/lib/types";
import { api, Modal, useData } from "./data";

type Brief = { who: string; company: string; history: string[]; theyAsked: string[]; openQuestions: string[]; products: string[]; deal: string; talkingPoints: string[]; watchOuts: string[]; meetingAt: number | null; generatedAt: number; stale: boolean };

/** The next meeting booked with this lead in the coming week, if any. */
export function nextMeeting(acts: { type: string; meetingAt: number | null; cancelled?: boolean }[]) {
  const now = Date.now();
  return acts.filter((a) => a.type === "meeting" && !a.cancelled && a.meetingAt && a.meetingAt > now && a.meetingAt < now + 7 * 86400_000).sort((a, b) => a.meetingAt! - b.meetingAt!)[0]?.meetingAt ?? null;
}

/** A short brief before meeting a lead. */
export function MeetingPrepDialog({ c, onClose }: { c: ContactDTO; onClose: () => void }) {
  const { m, toast } = useData();
  const at = nextMeeting(m.actsByContact.get(c.id) || []);
  const [b, setB] = useState<Brief | null>(null); const [busy, setBusy] = useState(true); const [err, setErr] = useState("");
  const load = async (force = false) => {
    setBusy(true); setErr("");
    try {
      if (!force) { const r = await api<{ ai: boolean; brief: Brief | null }>(`/api/contacts/${c.id}/prep`); if (!r.ai) { setErr("AI isn't turned on, so briefs can't be prepared."); return; } if (r.brief && !r.brief.stale) { setB(r.brief); return; } }
      const r = await api<{ brief: Brief | null }>(`/api/contacts/${c.id}/prep?${force ? "force=1&" : ""}${at ? `at=${at}` : ""}`, { method: "POST", json: {} }); setB(r.brief);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't prepare the brief."); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const sec = (t: string, xs: string[]) => xs.length ? <section className="prep-sec"><h3>{t}</h3><ul>{xs.map((x, i) => <li key={i}>{x}</li>)}</ul></section> : null;
  const copy = () => { if (!b) return; const txt = [`Meeting prep: ${c.name}`, b.who, b.company,
    "So far:", ...b.history.map((x) => `- ${x}`), "They asked for:", ...b.theyAsked.map((x) => `- ${x}`), "Open questions:", ...b.openQuestions.map((x) => `- ${x}`),
    `Deal: ${b.deal}`, "Talking points:", ...b.talkingPoints.map((x) => `- ${x}`), "Watch out for:", ...b.watchOuts.map((x) => `- ${x}`)].join("\n");
    navigator.clipboard?.writeText(txt).then(() => toast("Brief copied"), () => undefined); };
  return <Modal open onClose={onClose} label="Meeting prep"><div className="dlg form prep">
    <header><div><h2>Meeting prep: {c.name}</h2><div className="small muted">{at ? `Meeting ${new Date(at).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : "No meeting booked in the next 7 days"}</div></div>
      <button className="btn ghost" onClick={onClose}>Close</button></header>
    {busy ? <div className="ai-skeleton"><i /><i /><i /></div> : err ? <p className="muted">{err}</p> : b && <>
      <p className="prep-who"><b>{b.who}</b>{b.company && <><br /><span className="muted">{b.company}</span></>}</p>
      <div className="prep-grid">
        {sec("So far", b.history)}{sec("They asked for", b.theyAsked)}{sec("Talking points", b.talkingPoints)}{sec("Open questions", b.openQuestions)}{sec("Watch out for", b.watchOuts)}
        <section className="prep-sec"><h3>Deal and products</h3><p style={{ margin: 0 }}>{b.deal || "No deal yet"}</p>{b.products.length > 0 && <div className="chips" style={{ marginTop: 8 }}>{b.products.map((p) => <span key={p} className="pill">{p}</span>)}</div>}</section>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Prepared by AI from what the app knows {new Date(b.generatedAt).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}. It doesn't search the web, so check anything important.</p>
      <div className="btns"><button className="btn" onClick={() => load(true)}>Refresh</button><button className="btn ghost" onClick={copy}>Copy</button></div>
    </>}
  </div></Modal>;
}
