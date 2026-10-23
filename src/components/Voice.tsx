"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, Modal, useData } from "./data";
import { openMic, report, transcribeBlob, useHear } from "./LiveText";

/* Voice everywhere: a microphone on any text box (speak, and the words are typed in), and Voice capture (record, then make it a task or a note). */
export function useRecorder() {
  const [state, setStateRaw] = useState<"idle" | "starting" | "rec" | "busy">("idle"); const stateRef = useRef<"idle" | "starting" | "rec" | "busy">("idle");
  const setState = useCallback((s: "idle" | "starting" | "rec" | "busy") => { stateRef.current = s; setStateRaw(s); }, []);
  const [secs, setSecs] = useState(0); const live = useHear();
  const rec = useRef<MediaRecorder | null>(null); const chunks = useRef<Blob[]>([]); const timer = useRef<ReturnType<typeof setInterval> | null>(null); const done = useRef<((b: Blob | null) => void) | null>(null); const mime = useRef("audio/webm");
  const [slow, setSlow] = useState(false);
  const start = useCallback(async () => {
    if (stateRef.current !== "idle") return;   // one tap starts it; extra taps while it starts are ignored
    setState("starting"); setSlow(false);
    try {
      const stream = await openMic(() => setSlow(true));
      const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined); chunks.current = []; mime.current = (r.mimeType || type || "audio/webm").split(";")[0];
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => { stream.getTracks().forEach((t) => t.stop()); if (timer.current) clearInterval(timer.current); done.current?.(chunks.current.length ? new Blob(chunks.current, { type: mime.current }) : null); };
      r.start(1000); rec.current = r; setSecs(0); setState("rec"); setSlow(false); timer.current = setInterval(() => setSecs((s) => s + 1), 1000);
      try { live.start(() => (chunks.current.length ? new Blob(chunks.current, { type: mime.current }) : null)); } catch { /* live words are a bonus */ }
    } catch (e) { setState("idle"); setSlow(false); if (!(e instanceof Error && /microphone|record/i.test(e.message))) report("start", e instanceof Error ? e.message : String(e)); throw e instanceof Error && /microphone|record/i.test(e.message) ? e : new Error("Couldn't start recording. Try again."); }   // never stuck on "Starting…"
  }, [live, setState]);
  const stop = useCallback(() => new Promise<Blob | null>((res) => { done.current = res; setState("busy"); lastLive.current = live.stop(); rec.current?.stop(); }), [live, setState]);
  const lastLive = useRef("");
  return { state, setState, secs, start, stop, live: live.text, liveOk: live.supported, lastLive, slow };
}
export { transcribeBlob };
const EXCLUDED = new Set(["email", "number", "date", "datetime-local", "time", "month", "week", "password", "tel", "url", "color", "range", "file", "checkbox", "radio", "hidden", "submit", "button"]);
const eligible = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement =>
  !!el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !EXCLUDED.has(((el as HTMLInputElement).type || "text").toLowerCase()))) && !(el as HTMLInputElement).readOnly && !(el as HTMLInputElement).disabled
  && !(el as HTMLElement).closest("[data-novoice], .demo-layer, .voice-cap");
/** Put text in a field the way typing would (so the form notices), at the cursor. */
function insert(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  // on a computer, words go where your cursor is; on a phone (easy to tap mid-text by accident) or when you're not in the box, at the end
  const touch = window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches;
  const active = document.activeElement === el && !touch;
  const s = active ? el.selectionStart ?? el.value.length : el.value.length, e = active ? el.selectionEnd ?? el.value.length : el.value.length; const before = el.value.slice(0, s), after = el.value.slice(e);
  const add = (before && !/\s$/.test(before) ? " " : "") + text + (after && !/^\s/.test(after) ? " " : "");
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, before + add + after); el.dispatchEvent(new Event("input", { bubbles: true }));
  const at = (before + add).length; try { el.setSelectionRange(at, at); } catch { /* some input types */ }
  const pos = (before + add).length; el.focus(); try { el.setSelectionRange(pos, pos); } catch { /* some inputs can't */ }
}
/** The microphone that appears on whichever text box you're in. */
export function DictationMic() {
  const { m, toast, perms } = useData();
  return <DictationMicBase enabled={perms.write && !!m.config.transcribe} toast={toast} />;
}
/** The same microphone for pages outside the main app (Quick add). */
export function DictationMicBase({ enabled, toast }: { enabled: boolean; toast: (msg: string, kind?: "error" | "info") => void }) {
  const canVoice = enabled; const [field, setField] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null); const [, tick] = useState(0);
  const r = useRecorder(); const target = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null); const pressing = useRef(false);
  const [tidy, setTidy] = useState<{ el: HTMLInputElement | HTMLTextAreaElement; text: string } | null>(null);
  useEffect(() => { if (r.slow) toast("Your browser is asking to use the microphone: click Allow in the box near the address bar.", "info"); }, [r.slow]);   // eslint-disable-line react-hooks/exhaustive-deps
  const tidyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const on = (e: FocusEvent) => { const t = e.target as Element; if (eligible(t)) setField(t); };
    const off = (e: FocusEvent) => { const next = e.relatedTarget as Element | null; if (next?.closest?.(".dict-mic, .dict-bar, .dict-cap")) return;
      setTimeout(() => { if (pressing.current) return; if (!eligible(document.activeElement) && r.state === "idle") setField(null); }, 350); };
    const down = (e: PointerEvent) => { if ((e.target as Element)?.closest?.(".dict-mic, .dict-bar, .dict-cap")) { pressing.current = true; setTimeout(() => { pressing.current = false; }, 900); } };
    document.addEventListener("pointerdown", down, true);
    const move = () => tick((x) => x + 1);
    document.addEventListener("focusin", on); document.addEventListener("focusout", off); window.addEventListener("scroll", move, true); window.addEventListener("resize", move);
    return () => { document.removeEventListener("pointerdown", down, true); document.removeEventListener("focusin", on); document.removeEventListener("focusout", off); window.removeEventListener("scroll", move, true); window.removeEventListener("resize", move); };
  }, [r.state]);
  if (!canVoice || typeof window === "undefined" || !("MediaRecorder" in window)) return null;
  const el = r.state === "idle" ? (field || (tidy?.el.isConnected ? tidy.el : null)) : target.current; if (!el || !el.isConnected) return null;
  const raw = el.getBoundingClientRect(); if (!raw.width) return null; const host = (el.closest("dialog[open]") as HTMLElement) || document.body;
  // inside a pop-up that is moved or animated, "pinned to the screen" is measured from the pop-up, so offset by its position
  const hs = host === document.body ? null : getComputedStyle(host); // everything that makes "fixed" measure from the pop-up instead of the screen (the frosted-glass blur on the app's forms is one)
  const wc = hs?.willChange || ""; const bf = hs ? (hs as CSSStyleDeclaration & { webkitBackdropFilter?: string }).backdropFilter || (hs as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter || "none" : "none";
  const shifted = !!hs && (hs.transform !== "none" || hs.filter !== "none" || hs.perspective !== "none" || (bf !== "none" && bf !== "") || /paint|layout|strict|content/.test(hs.contain || "")
    || /transform|perspective|filter/.test(wc) || (hs.containerType && hs.containerType !== "normal") || hs.translate !== "none" || hs.scale !== "none" || hs.rotate !== "none");
  const hr = shifted ? host.getBoundingClientRect() : { top: 0, left: 0 };
  const box = { top: raw.top - hr.top, bottom: raw.bottom - hr.top, left: raw.left - hr.left, right: raw.right - hr.left, height: raw.height, width: raw.width };
  // inside such a pop-up the button scrolls with the pop-up's content, so allow for how far it's scrolled
  const sy = shifted ? host.scrollTop : 0, sx = shifted ? host.scrollLeft : 0;
  const big = el.tagName === "TEXTAREA";
  const click = async () => {
    if (r.state === "starting" || r.state === "busy") return;
    if (r.state === "idle") { target.current = el; try { await r.start(); } catch (e) { target.current = null; toast(e instanceof Error ? e.message : "Couldn't start the microphone.", "error"); } return; }
    if (r.state !== "rec") return; const b = await r.stop(); const f = target.current; const heard = r.lastLive.current;
    const offerTidy = (el: HTMLInputElement | HTMLTextAreaElement, t: string) => { setTidy({ el, text: t }); if (tidyTimer.current) clearTimeout(tidyTimer.current); tidyTimer.current = setTimeout(() => setTidy(null), 20000); };
    if (heard && f) {
      // no waiting: your live words go in now; the more accurate AI text replaces them when it's ready (unless you've changed them)
      insert(f, heard); offerTidy(f, heard); r.setState("idle"); target.current = null; setField(f);   // the mic stays: tap again to add more
      if (b) transcribeBlob(b).then((t) => { if (!t || t === heard || !f.isConnected) return; const at = f.value.lastIndexOf(heard); if (at < 0) return;
        const proto = f.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(f, f.value.slice(0, at) + t + f.value.slice(at + heard.length)); f.dispatchEvent(new Event("input", { bubbles: true })); offerTidy(f, t); }).catch(() => undefined);
      return; }
    let text = ""; try { text = b ? await transcribeBlob(b) : ""; } catch (e) { toast(e instanceof Error ? e.message : "Couldn't transcribe that.", "error"); }
    if (text && f) { insert(f, text); offerTidy(f, text); } else if (!text) toast("Didn't catch anything. Check the microphone and try again.", "error");
    r.setState("idle"); target.current = null; if (f?.isConnected) setField(f); };
  const doTidy = async () => { if (!tidy) return; const { el: f, text } = tidy; setTidy(null);
    try { const j = await api<{ text: string }>("/api/ai/rewrite", { json: { text, action: "custom", instruction: "This was dictated by voice. Fix punctuation, capitalisation and obvious speech-to-text mistakes, and remove filler words (um, uh, you know). Keep the wording and meaning otherwise; don't add anything.", kind: "note" } });
      const at = f.value.lastIndexOf(text); if (at < 0) return; const proto = f.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(f, f.value.slice(0, at) + j.text.trim() + f.value.slice(at + text.length)); f.dispatchEvent(new Event("input", { bubbles: true })); toast("Tidied up"); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't tidy that up.", "error"); } };
  const cancel = async () => { await r.stop().catch(() => null); r.setState("idle"); target.current = null; };   // throw this recording away
  // everything sits right by the box: under its right corner, or just above it if there's no room below (never jumps away)
  const vh = host === document.body ? window.innerHeight : host.getBoundingClientRect().height; const vw = window.innerWidth;
  const place = (h: number) => (box.bottom + 6 + h <= vh - 4 ? box.bottom + 6 : Math.max(6, box.top - 6 - h));
  const barW = Math.min(Math.max(box.width, 300), vw - 16); const barLeft = Math.max(8, Math.min(box.left, vw - barW - 8));   // under the box's left corner, clear of the ✦ AI tools on the right
  const tap = (e: React.PointerEvent) => { e.preventDefault(); click(); };   // reacts to the first touch (and keeps the keyboard where it is)
  const key = (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); click(); } };
  // the bar grows with your words: downwards from under the box, or upwards from above it when there's no room below
  const growMax = Math.round(Math.min(320, vh * 0.42)); const below = box.bottom + 6 + growMax <= vh - 4;
  const barPos: React.CSSProperties = below ? { top: box.bottom + 6 + sy } : { bottom: Math.max(6, vh - box.top + 6) - sy };
  const cap = r.state === "rec" || r.state === "busy" ? <div className={"dict-bar" + (r.state === "busy" ? " busy" : "")} role="status" aria-live="polite" style={{ ...barPos, left: barLeft + sx, width: barW, maxHeight: growMax }}>
      {r.state === "rec" ? <>
        <div className="dict-bar-top"><span className="dot" /><b>{Math.floor(r.secs / 60)}:{String(r.secs % 60).padStart(2, "0")}</b><span className="dict-bar-hint">{r.live ? "Listening…" : "Listening… start speaking"}</span>
          <button type="button" className="dict-stop" data-novoice onPointerDown={tap} onKeyDown={key} aria-label="Stop and type what I said">■ Stop</button>
          <button type="button" className="dict-cancel" data-novoice onPointerDown={(e) => { e.preventDefault(); cancel(); }} aria-label="Cancel this recording">✕</button></div>
        {r.live && <div className="dict-bar-live" ref={(e) => { if (e) e.scrollTop = e.scrollHeight; }}>{r.live}</div>}</>
      : <span className="dict-bar-t"><span className="spin" aria-hidden="true" /><span>✨ Typing what you said…</span></span>}</div>
    : tidy && tidy.el === el ? <div className="dict-cap tidy" style={{ top: place(34) + sy, left: Math.max(8, Math.min(box.left + 112, vw - 268)) + sx }}>
      <button type="button" className="btn sm" data-novoice onMouseDown={(e) => e.preventDefault()} onClick={doTidy}>✨ Tidy up with AI</button><button type="button" className="linkbtn small" onMouseDown={(e) => e.preventDefault()} onClick={() => setTidy(null)}>Keep as is</button></div> : null;
  return createPortal(<>{cap}{(r.state === "idle" || r.state === "starting") && <button type="button" className={"dict-mic dict-speak" + (r.state === "starting" ? " starting" : "")} data-novoice aria-label="Speak instead of typing"
    title="Speak instead of typing" onPointerDown={tap} onKeyDown={key} style={{ top: place(34) + sy, left: Math.max(8, Math.min(box.left, vw - 112)) + sx }}>{r.state === "starting" ? (r.slow ? "Allow the microphone in your browser ↑" : "Starting…") : "🎙 Speak"}</button>}</>, host);
}
