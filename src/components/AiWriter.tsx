"use client";
import { useEffect, useRef, useState } from "react";
import { api, useData } from "./data";
import { useRecorder } from "./thread";

type SR = { start: () => void; stop: () => void; continuous: boolean; interimResults: boolean; lang: string; onresult: ((e: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const QUICK = ["Follow up on our booth conversation", "Ask for a 30 minute call next week", "Send pricing and offer a walkthrough", "Make it shorter", "Make it more formal", "Make it warmer and more personal"];

/**
 * Tell the AI what to write, by typing or speaking. With an OpenAI key the recording is transcribed on the server;
 * otherwise the browser's own dictation is used where available (Chrome, Edge, Safari).
 */
export function AiWriter({ contactId, subject, body, intent, onDraft }: { contactId: string; subject: string; body: string; intent: string; onDraft: (subject: string, body: string) => void }) {
  const { m, toast } = useData();
  const [open, setOpen] = useState(false); const [prompt, setPrompt] = useState(""); const [busy, setBusy] = useState<"" | "write" | "improve" | "listen">("");
  const [live, setLive] = useState(false); const sr = useRef<SR | null>(null);
  const append = (t: string) => setPrompt((p) => (p ? `${p.trimEnd()} ${t}` : t).trim());
  const rec = useRecorder(async (f) => {
    setBusy("listen");
    const fd = new FormData(); fd.append("audio", f);
    try { const r = await api<{ text: string }>("/api/ai/transcribe", { form: fd }); if (r.text) append(r.text); else toast("Didn't catch that. Try again a little closer to the microphone.", "error"); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't turn that into text.", "error"); }
    setBusy("");
  });
  const SpeechAPI = typeof window !== "undefined" ? ((window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition) : undefined;
  const canRecord = typeof window !== "undefined" && "MediaRecorder" in window;
  useEffect(() => () => sr.current?.stop(), []);
  const dictate = () => {
    if (live) { sr.current?.stop(); return; }
    if (!SpeechAPI) return;
    const r = new SpeechAPI(); r.continuous = true; r.interimResults = false; r.lang = navigator.language || "en-US";
    r.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) append(e.results[i][0].transcript); };
    r.onend = () => setLive(false); r.onerror = (e) => { setLive(false); if (e.error !== "no-speech" && e.error !== "aborted") toast("Dictation stopped. Check microphone access.", "error"); };
    sr.current = r; r.start(); setLive(true);
  };
  const go = async (mode: "write" | "improve") => {
    setBusy(mode);
    try {
      const r = await api<{ subject: string; body: string }>("/api/ai/draft", { json: { contactId, intent, instructions: prompt, ...(mode === "improve" ? { currentSubject: subject, currentBody: body } : {}) } });
      onDraft(r.subject, r.body); toast(mode === "improve" ? "Draft updated. Review before sending." : "Draft ready. Review before sending.");
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't write the email.", "error"); }
    setBusy("");
  };
  if (!open) return <button type="button" className="btn ai-open" onClick={() => setOpen(true)}>✦ Write with AI <span className="small muted">type or speak what you want</span></button>;
  const useServer = m.config.transcribe && canRecord;
  return <div className="ai-writer">
    <div className="inline" style={{ justifyContent: "space-between" }}><b>✦ Write with AI</b><button type="button" className="linkbtn" onClick={() => setOpen(false)}>Hide</button></div>
    <div className="ai-prompt">
      <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} aria-label="What should the email say?"
        placeholder={'What should it say? e.g. "Thank him for stopping by, mention the demo for his 40 locations, ask for a call Thursday"'} />
      {useServer ? (rec.recording
        ? <button type="button" className="btn danger mic" onClick={rec.stop} aria-label="Stop recording">■ {Math.floor(rec.secs / 60)}:{String(rec.secs % 60).padStart(2, "0")}</button>
        : <button type="button" className="btn mic" onClick={rec.start} disabled={busy === "listen"} aria-label="Speak your instructions" title="Speak your instructions">{busy === "listen" ? "…" : "🎤"}</button>)
        : SpeechAPI ? <button type="button" className={"btn mic" + (live ? " danger" : "")} onClick={dictate} aria-label={live ? "Stop dictation" : "Speak your instructions"} title="Speak your instructions">{live ? "■" : "🎤"}</button> : null}
    </div>
    {(rec.recording || live) && <p className="small" style={{ color: "var(--cold)", margin: 0 }}>● Listening… say what the email should cover, then press stop.</p>}
    {rec.recording && rec.live && <div className="rec-live" aria-live="polite">{rec.live}</div>}
    {busy === "listen" && <p className="small muted" style={{ margin: 0 }}>Turning your voice into text…</p>}
    <div className="chips" style={{ marginTop: 0 }}>{QUICK.map((q) => <button key={q} type="button" className="chip" onClick={() => setPrompt(q)}>{q}</button>)}</div>
    <div className="btns" style={{ marginTop: 0 }}>
      <button type="button" className="btn primary" disabled={!!busy} onClick={() => go("write")}>{busy === "write" ? "Writing…" : "Write the email"}</button>
      {body.trim() && <button type="button" className="btn" disabled={!!busy || !prompt.trim()} onClick={() => go("improve")} title="Keeps your current draft and changes it the way you asked">{busy === "improve" ? "Updating…" : "Improve my current draft"}</button>}
      <span className="small muted">Uses this lead's history. Review before sending.</span>
    </div>
  </div>;
}
