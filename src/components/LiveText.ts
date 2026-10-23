"use client";
import { useCallback, useRef, useState } from "react";

/**
 * Live captions while recording, using the browser's own speech recognition (Chrome, Edge, Safari incl. iPhone).
 * The recording is still transcribed by AI afterwards for the accurate final text; this is what you see as you speak.
 */
type Rec = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null };
/** Live words only on computers: on phones and tablets the browser's recognition and the recording fight over the
 *  microphone (one gets silence), so there we just record and let AI type it out as soon as you stop. */
const touchDevice = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches;
export const liveSupported = () => typeof window !== "undefined" && !touchDevice() && !!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);
export function useLiveText() {
  const [text, setText] = useState(""); const r = useRef<Rec | null>(null); const done = useRef(""); const on = useRef(false);
  const start = useCallback(() => {
    setText(""); done.current = ""; if (!liveSupported()) return;
    const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }; const SR = W.SpeechRecognition || W.webkitSpeechRecognition!;
    const rec = new SR(); rec.lang = navigator.language || "en-US"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e) => { let interim = ""; for (let i = e.resultIndex; i < e.results.length; i++) { const x = e.results[i]; if (x.isFinal) done.current += `${x[0].transcript.trim()} `; else interim += x[0].transcript; } setText((done.current + interim).trim()); };
    rec.onerror = () => undefined; rec.onend = () => { if (on.current) { try { rec.start(); } catch { /* ended for good */ } } };   // some browsers stop after a pause: keep listening
    on.current = true; r.current = rec; try { rec.start(); } catch { /* not allowed here */ }
  }, []);
  const stop = useCallback(() => { on.current = false; try { r.current?.stop(); } catch { /* already stopped */ } r.current = null; return done.current.trim() || text; }, [text]);
  return { text, start, stop, supported: liveSupported() };
}

/** Send a recording to be typed out (used for the final text, and for the rolling words on phones). */
export async function transcribeBlob(b: Blob): Promise<string> {
  const fd = new FormData(); const ext = b.type.includes("mp4") ? "m4a" : "webm"; fd.append("audio", new File([b], `voice.${ext}`, { type: b.type }));
  const r = await fetch("/api/ai/transcribe", { method: "POST", body: fd }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Couldn't transcribe that.");
  return String(j.text || "").trim();
}
/**
 * Your words while you speak, on every device. Computers: the browser's instant live words. Phones and tablets:
 * the recording so far is typed out every 3 seconds (the browser's own recognition fights the recording for the mic there).
 */
export function useHear() {
  const live = useLiveText(); const [rolling, setRolling] = useState(""); const latest = useRef(""); const timer = useRef<ReturnType<typeof setInterval> | null>(null); const inFlight = useRef(false);
  const phone = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches;
  const start = useCallback((getBlob: () => Blob | null) => {
    if (!phone) { live.start(); return; }
    setRolling(""); latest.current = ""; if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => { if (inFlight.current) return; const b = getBlob(); if (!b || b.size < 3000) return; inFlight.current = true;
      try { const t = await transcribeBlob(b); if (t) { latest.current = t; setRolling(t); } } catch { /* just a preview */ } finally { inFlight.current = false; } }, 3000);
  }, [live, phone]);
  const stop = useCallback(() => { if (!phone) return live.stop(); if (timer.current) clearInterval(timer.current); timer.current = null; return latest.current; }, [live, phone]);
  return { text: phone ? rolling : live.text, start, stop, supported: phone ? true : live.supported, rolling: phone };
}

/** Open the microphone, with a plain reason if it can't, a hint while the browser is asking, and a report of failures. */
export async function openMic(onSlow?: () => void): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) { report("no-media-devices", "This browser can't record here"); throw new Error("This browser can't record audio here. Try Chrome, Edge or Safari."); }
  const slow = setTimeout(() => onSlow?.(), 2000);   // the browser is probably showing "Allow microphone?"
  try {
    return await Promise.race([navigator.mediaDevices.getUserMedia({ audio: true }),
      new Promise<MediaStream>((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { name: "TimeoutError" })), 25000))]);
  } catch (e) {
    const n = (e as { name?: string })?.name || "Error"; report(n, (e as Error)?.message || "");
    throw new Error(n === "NotAllowedError" || n === "SecurityError" ? "The microphone is blocked. Click the 🔒 or 🎙 icon in the address bar, allow the microphone, and try again."
      : n === "NotFoundError" || n === "OverconstrainedError" ? "No microphone was found. Plug one in or check your sound settings."
      : n === "NotReadableError" || n === "AbortError" ? "The microphone is busy in another app (for example a call). Close it and try again."
      : n === "TimeoutError" ? "The browser didn't give access to the microphone. Look for the permission prompt near the address bar, allow it, and try again."
      : `Couldn't start the microphone (${n}).`);
  } finally { clearTimeout(slow); }
}
/** Tell the server about a mic problem on this device (admins see recent ones in Settings). */
export function report(name: string, message: string) {
  try { navigator.sendBeacon?.("/api/client-log", new Blob([JSON.stringify({ kind: "mic", name, message: message.slice(0, 300), ua: navigator.userAgent.slice(0, 200), at: Date.now() })], { type: "application/json" })); } catch { /* best effort */ }
}

