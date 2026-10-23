"use client";
import { useEffect } from "react";

/** Every section with a heading gets "– Minimise" beside its heading (and "Show full" when minimised), on every page in
 *  the app. Remembered per page and section on this device. Short sections, cards, pop-up
 *  forms and anything that already has its own minimise are left alone. */
const KEY = "lt-sec-min";
const SKIP = ".ld-card, .kpi, .ai-fold-min, .cc-sheet, .ai-brief, .next-acts, .dlg, [role=dialog], .no-min";
const load = (): Record<string, boolean> => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };
const save = (v: Record<string, boolean>) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } };
function headingOf(p: HTMLElement) {
  for (const h of p.querySelectorAll<HTMLElement>("h2, h3")) { if (h.closest(".panel") === p && !h.closest(SKIP)) return h; }
  return null;
}
function topChild(p: HTMLElement, el: HTMLElement) { let n: HTMLElement | null = el; while (n && n.parentElement !== p) n = n.parentElement; return n; }
function apply() {
  const state = load(); const tall = window.innerHeight * 1.15;
  document.querySelectorAll<HTMLElement>(".panel").forEach((p) => {
    if (p.matches(SKIP) || p.closest(".dlg, [role=dialog]") || p.querySelector(".ai-fold-btn")) return;
    const h = headingOf(p); if (!h) return; const name = (h.firstChild?.textContent || h.textContent || "").replace(/[–▸▾]|Minimise|Show full/g, "").trim().slice(0, 80); if (!name) return;
    const key = `${location.pathname}|${name}`; const min = !!state[key];
    let btn = h.querySelector<HTMLButtonElement>(":scope > .sec-min-btn");
    // every section with a heading gets Minimise, consistently (whatever its height); a section with nothing below its heading has nothing to minimise
    if (p.children.length < 2 && !min) { btn?.remove(); return; }
    void tall;
    if (!btn) { btn = document.createElement("button"); btn.type = "button"; btn.className = "linkbtn small sec-min-btn";
      btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); const s = load(); s[key] = !s[key]; if (!s[key]) delete s[key]; save(s); apply(); }); h.appendChild(btn); }
    btn.textContent = min ? "Show full" : "– Minimise"; btn.setAttribute("aria-expanded", String(!min)); btn.title = min ? `Show all of ${name}` : `Minimise ${name}`;
    const keep = topChild(p, h);
    for (const c of Array.from(p.children) as HTMLElement[]) c.classList.toggle("sec-min-hide", min && c !== keep);
    p.classList.toggle("sec-min", min);
  });
}
export function TallSections() {
  useEffect(() => {
    let raf = 0; const run = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(apply); };
    run(); const mo = new MutationObserver((ms) => { if (ms.every((m) => (m.target as HTMLElement).classList?.contains?.("sec-min-btn"))) return; run(); });
    mo.observe(document.body, { childList: true, subtree: true }); window.addEventListener("resize", run);
    return () => { mo.disconnect(); window.removeEventListener("resize", run); cancelAnimationFrame(raf); };
  }, []);
  return null;
}
