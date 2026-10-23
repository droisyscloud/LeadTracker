"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useData } from "./data";
import { ALL_STEPS, DEMO, voiceUrl, type DemoStep } from "./demoScript";

type Step = DemoStep & { chapter: number };
type Opened = { ui: NonNullable<DemoStep["ui"]>; sel: string; toggle: HTMLElement | null };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const visible = (e: Element) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
/** An element by selector (skipping the demo's own), optionally the one whose text includes `btn`. */
function find(sel: string, btn?: string): HTMLElement | null {
  const all = [...document.querySelectorAll<HTMLElement>(sel)].filter((e) => !e.closest(".demo-layer") && visible(e));
  return (btn ? all.find((e) => e.textContent?.includes(btn)) : all[0]) || null;
}
const otherDialogs = () => [...document.querySelectorAll<HTMLDialogElement>("dialog[open]")].filter((d) => !d.classList.contains("demo-layer"));

/**
 * The narrated demo. It sits above everything (pop-ups included) so its controls always work; it opens the
 * menus and windows a step explains and closes them before a step that doesn't use them; the highlight
 * follows its target (even when the page redraws) and the control bar moves out of the way. Never saves.
 */
export function DemoPlayer() {
  const { m, perms } = useData(); const router = useRouter();
  const [on, setOn] = useState(false); const [i, setI] = useState(0); const [playing, setPlaying] = useState(true);
  const [rate, setRate] = useState(1); const [muted, setMuted] = useState(false); const [box, setBox] = useState<DOMRect | null>(null); const [caption, setCaption] = useState("");
  const [barTop, setBarTop] = useState(false); const [compact, setCompact] = useState(false);
  const layer = useRef<HTMLDialogElement>(null); const bar = useRef<HTMLDivElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null); const timer = useRef<ReturnType<typeof setTimeout> | null>(null); const run = useRef(0);
  const target = useRef<{ sel: string; btn?: string } | null>(null); const el = useRef<HTMLElement | null>(null); const opened = useRef<Opened | null>(null);
  const settings = useRef({ rate: 1, muted: false, playing: true }); settings.current = { rate, muted, playing };
  const mode = useRef<"play" | "check" | "step">("play"); const results = useRef<{ id: string; found: boolean }[]>([]);

  const lead = [...m.contacts].sort((a, b) => (m.actsByContact.get(b.id)?.length || 0) - (m.actsByContact.get(a.id)?.length || 0))[0];
  const deal = [...m.deals].sort((a, b) => m.payments.filter((p) => p.dealId === b.id).length - m.payments.filter((p) => p.dealId === a.id).length)[0];
  const company = [...m.companies].sort((a, b) => m.contacts.filter((c) => c.companyId === b.id).length - m.contacts.filter((c) => c.companyId === a.id).length)[0];
  const CH = DEMO;
  const steps: Step[] = ALL_STEPS.filter((s) => true
    && (s.role !== "admin" || perms.admin) && (s.role !== "manager" || perms.manage) && (!s.billing || perms.billing)
    && (!s.path.includes("{lead}") || lead) && (!s.path.includes("{deal}") || deal) && (!s.path.includes("{company}") || company));
  const stepsRef = useRef(steps); stepsRef.current = steps;
  const pathOf = (s: Step) => s.path.replace("{lead}", lead?.id || "").replace("{deal}", deal?.id || "").replace("{company}", company?.id || "");

  /** keep the demo above any pop-up that opened after it */
  const raise = () => { const d = layer.current; if (!d) return; if (d.open) d.close(); try { d.showModal(); } catch { /* not attached yet */ } };
  const stopSound = () => { audio.current?.pause(); audio.current = null; if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); if (timer.current) clearTimeout(timer.current); };

  /** close whatever menu or window the demo opened, and wait until it's gone */
  const closeOpened = async () => {
    const o = opened.current; opened.current = null; if (!o) return;
    const still = () => !!find(o.sel);
    if (o.ui === "email" || o.ui === "call") find(".compose button", "Cancel")?.click();
    else if (o.ui === "jump") { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); await sleep(60); document.querySelector(".jump")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); }
    else if (o.ui === "deal") otherDialogs().forEach((d) => d.close());
    else if (o.toggle && still()) o.toggle.click();
    for (let t = 0; t < 10 && still(); t++) {
      await sleep(120);
      if (still() && t === 3) { document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); document.querySelector<HTMLElement>(".menu-backdrop")?.click(); }
      if (still() && t === 6) otherDialogs().forEach((d) => d.close());
    }
  };
  /** open the menu or window a step explains, if it isn't open already */
  const openFor = async (s: Step) => {
    if (!s.ui || find(s.sel, s.btn)) { if (s.ui && !opened.current) opened.current = { ui: s.ui, sel: s.ui === "email" || s.ui === "call" ? ".compose" : s.sel.split(" ")[0], toggle: s.click ? find(s.click, s.clickText) : null }; return; }
    let toggle: HTMLElement | null = null;
    if (s.event) window.dispatchEvent(new CustomEvent(s.event));
    else if (s.open) find(".actions.dock button, .actions button", s.open)?.click();
    else if (s.click) { toggle = find(s.click, s.clickText); toggle?.click(); }
    opened.current = { ui: s.ui, sel: s.ui === "email" || s.ui === "call" ? ".compose" : s.ui === "deal" ? "dialog .dlg" : s.sel.split(" ")[0], toggle };
    await sleep(350);
  };

  const finish = useCallback(async () => { run.current++; stopSound(); await closeOpened(); layer.current?.close(); setOn(false); setBox(null); target.current = null; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** place the highlight on its target (finding it again if the page redrew), and move the bar out of the way */
  const place = useCallback(() => {
    const t = target.current; if (!t) return;
    if (!el.current || !el.current.isConnected || !visible(el.current)) el.current = find(t.sel, t.btn);
    if (!el.current) { setBox(null); return; }
    const r = el.current.getBoundingClientRect(); const vw = window.innerWidth, vh = window.innerHeight;
    // keep the outline (drawn 6px outside the part) inside the screen, even for parts taller than it
    const M = 9; const top = Math.max(M, r.top), left = Math.max(M, r.left), bottom = Math.min(vh - M, r.bottom), right = Math.min(vw - M, r.right);
    if (bottom <= top || right <= left) { setBox(null); return; }
    setBox(new DOMRect(left, top, right - left, bottom - top));
  }, []);
  /** decide once per step (and on resize) whether the bar sits at the bottom or the top, so it never jumps about */
  const placeBar = useCallback(() => {
    const e = el.current; if (!e) { setBarTop(false); setCompact(false); return; }
    const r = e.getBoundingClientRect(); const vh = window.innerHeight; const phone = window.innerWidth < 600;
    // on phones, a large highlighted part gets a compact bar (half the height) so it can sit clear of it
    const small = phone && r.height > vh * 0.4; setCompact(small);
    const bh = (small ? 104 : phone ? 190 : 150) + 20;
    setBarTop(r.bottom > vh - bh && r.top > bh);
  }, []);

  const speak = (s: Step, token: number, next: () => void) => {
    let finished = false;
    const done = () => { if (finished || token !== run.current) return; finished = true; timer.current = setTimeout(next, 450); };
    const expected = (s.say.split(/\s+/).length / 2.6) * 1000 / settings.current.rate;
    const fallback = () => {
      if (token !== run.current) return;
      if (!settings.current.muted && typeof speechSynthesis !== "undefined") {
        const u = new SpeechSynthesisUtterance(s.say); u.rate = settings.current.rate; u.onend = done; u.onerror = () => { timer.current = setTimeout(done, expected); };
        speechSynthesis.cancel(); speechSynthesis.speak(u);
        setTimeout(() => { if (settings.current.playing) done(); }, expected * 1.6 + 3000);   // some devices never report the end
      } else timer.current = setTimeout(done, expected);
    };
    if (settings.current.muted) { fallback(); return; }
    const a = new Audio(voiceUrl(s)); a.playbackRate = settings.current.rate; audio.current = a;
    a.onended = done; a.onerror = fallback; a.play().catch(fallback);
  };

  const go = useCallback(async (n: number) => {
    const token = ++run.current; stopSound();
    const list = stepsRef.current;
    if (n >= list.length) { if (mode.current === "check") (window as unknown as { __demoCheck: unknown }).__demoCheck = results.current; await finish(); return; }
    n = Math.max(0, n);
    const s = list[n]; setI(n); setCaption(s.say); setBox(null); target.current = null; el.current = null;
    (window as unknown as { __demoAt: unknown }).__demoAt = null;
    // close the previous step's menu or window unless this step uses the same one
    if (opened.current && opened.current.ui !== s.ui) await closeOpened();
    if (token !== run.current) return;
    const to = pathOf(s); const here = () => window.location.pathname + window.location.search;
    if (here() !== to) { if (opened.current) await closeOpened(); router.push(to); }
    let e: HTMLElement | null = null; let tries = 0;
    for (let t = 0; t < 45 && token === run.current; t++) {
      // make sure we really arrived: closing a window can send the app back to the page it came from
      if (t % 4 === 3 && here() !== to) router.push(to);
      e = find(s.sel, s.btn);
      // wait for it to stay put: pages sometimes redraw just after they appear
      if (e) { await sleep(250); const again = find(s.sel, s.btn); if (again) { e = again; break; } e = null; }
      if (s.ui && tries < 3 && t % 5 === 2) { tries++; await openFor(s); }
      await sleep(200);
    }
    if (token !== run.current) return;
    if (s.ui && e) await openFor(s);
    raise();
    if (mode.current === "check") { results.current.push({ id: s.id, found: !!e }); go(n + 1); return; }
    if (!e) { go(n + 1); return; }   // not on this person's screen: skip
    el.current = e; target.current = { sel: s.sel, btn: s.btn };
    // bring it into view, leaving room for the control bar
    e.scrollIntoView({ block: e.getBoundingClientRect().height > window.innerHeight * 0.6 ? "start" : "center" });
    await sleep(80);
    // if it would fit above the control bar but sits partly under it, scroll it up into the space above
    { const bh = (bar.current?.offsetHeight || 150) + 28; const r = e.getBoundingClientRect(); const room = window.innerHeight - bh;
      if (r.height <= room - 70 && r.bottom > room) { e.scrollIntoView({ block: "start" }); await sleep(60); const r2 = e.getBoundingClientRect(); if (r2.top < 70) window.scrollBy(0, r2.top - 70); await sleep(60); } }
    place(); placeBar();
    if (mode.current === "step") { (window as unknown as { __demoAt: unknown }).__demoAt = { id: s.id, n, total: list.length, sel: s.sel, btn: s.btn || null, ui: s.ui || null, say: s.say }; return; }
    if (settings.current.playing) speak(s, token, () => go(n + 1));
  }, [router, finish, place]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const start = (ev: Event) => {
      const det = (ev as CustomEvent).detail || {}; const ch = det.chapter as number | undefined;
      mode.current = det.check ? "check" : det.step ? "step" : "play"; results.current = [];
      setOn(true); setPlaying(true); settings.current.playing = true;
      setTimeout(() => { const idx = ch === undefined ? 0 : Math.max(0, stepsRef.current.findIndex((s) => s.chapter >= ch)); raise(); go(idx); }, 160);
    };
    window.addEventListener("lt:demo", start); return () => window.removeEventListener("lt:demo", start);
  }, [go]);
  // follow the target as the page moves or redraws; stay above any pop-up that opens
  useEffect(() => {
    if (!on) return;
    let raf = 0; let lastDialogs = 0;
    const tick = () => { place(); const n = otherDialogs().length; if (n !== lastDialogs) { lastDialogs = n; if (n) raise(); } raf = window.setTimeout(tick, 250) as unknown as number; };
    const resized = () => { place(); placeBar(); };
    tick(); window.addEventListener("scroll", place, true); window.addEventListener("resize", resized);
    return () => { clearTimeout(raf); window.removeEventListener("scroll", place, true); window.removeEventListener("resize", resized); };
  }, [on, place, placeBar]);
  useEffect(() => () => stopSound(), []);

  const s = steps[i];
  const toggle = () => {
    if (playing) { setPlaying(false); settings.current.playing = false; audio.current?.pause(); if (typeof speechSynthesis !== "undefined") speechSynthesis.pause(); if (timer.current) clearTimeout(timer.current); }
    else {
      setPlaying(true); settings.current.playing = true; place();
      if (audio.current && !audio.current.ended && audio.current.currentTime > 0) audio.current.play().catch(() => go(i));
      else if (typeof speechSynthesis !== "undefined" && speechSynthesis.paused) speechSynthesis.resume();
      else go(i);
    }
  };
  // clicks on the demo's controls must not count as "clicking outside" a menu the demo is showing
  const keep = (e: { stopPropagation: () => void }) => e.stopPropagation();
  // the layer only exists while the demo runs, so nothing else on the page ever mistakes it for a window
  if (!on) return null;
  return <dialog ref={layer} className="demo-layer" aria-label="Demo" onCancel={(e) => { e.preventDefault(); finish(); }} onMouseDown={keep} onPointerDown={keep} onTouchStart={keep} onClick={keep}>
    {on && <>
      {box && <div className="tour-ring demo-ring" style={{ top: box.top - 6, left: box.left - 6, width: box.width + 12, height: box.height + 12 }} aria-hidden="true" />}
      <div ref={bar} className={"demo-bar" + (barTop ? " top" : "") + (compact ? " compact" : "")} role="region" aria-label="Demo player">
        <div className="demo-cap" aria-live="polite"><span className="demo-ch">{CH[s?.chapter ?? 0]?.title} · {i + 1} of {steps.length}</span>{caption}</div>
        <div className="demo-ctl">
          <select aria-label="Chapter" value={s?.chapter ?? 0} onChange={(e) => { const ch = Number(e.target.value); go(Math.max(0, steps.findIndex((x) => x.chapter >= ch))); }}>
            {CH.map((c, ci) => steps.some((x) => x.chapter === ci) && <option key={ci} value={ci}>{ci + 1}. {c.title}</option>)}</select>
          <button type="button" className="btn sm ghost" aria-label="Back" onClick={() => go(i - 1)} disabled={i === 0}>◀</button>
          <button type="button" className="btn sm primary demo-play" aria-label={playing ? "Pause" : "Play"} onClick={toggle}>{playing ? "❚❚" : "▶"}</button>
          <button type="button" className="btn sm ghost" aria-label="Next" onClick={() => go(i + 1)}>▶▶</button>
          <select aria-label="Speed" value={rate} onChange={(e) => { const r = Number(e.target.value); setRate(r); settings.current.rate = r; if (audio.current) audio.current.playbackRate = r; }}><option value={1}>1×</option><option value={1.25}>1.25×</option><option value={1.5}>1.5×</option></select>
          <button type="button" className="btn sm ghost" aria-label={muted ? "Turn the voice on" : "Mute"} onClick={() => { const v = !muted; setMuted(v); settings.current.muted = v; go(i); }}>{muted ? "🔇" : "🔊"}</button>
          <button type="button" className="btn sm ghost" aria-label="Stop the demo" onClick={finish}>✕</button>
        </div>
      </div>
    </>}
  </dialog>;
}
