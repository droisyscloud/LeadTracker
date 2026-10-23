"use client";
import { useEffect } from "react";

/** Big numbers on cards shrink to fit their card instead of being cut off.
 *  Measured in the browser, so it works for any number, card width or screen size; re-checked when numbers change or the window resizes. */
const SEL = ".kpi .val, .ld-card .ld-v";
function fit() {
  document.querySelectorAll<HTMLElement>(SEL).forEach((el) => {
    el.style.fontSize = ""; const box = el.parentElement; if (!box) return;
    const avail = box.clientWidth - parseFloat(getComputedStyle(box).paddingLeft) - parseFloat(getComputedStyle(box).paddingRight); if (avail <= 0) return;
    let fs = parseFloat(getComputedStyle(el).fontSize); let n = 0;
    while (el.scrollWidth > avail + 0.5 && fs > 12 && n++ < 40) { fs -= 1; el.style.fontSize = `${fs}px`; }
  });
}
export function FitNumbers() {
  useEffect(() => {
    let raf = 0; const run = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); };
    run(); const mo = new MutationObserver(run); mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", run); document.fonts?.ready.then(run).catch(() => undefined);
    return () => { mo.disconnect(); window.removeEventListener("resize", run); cancelAnimationFrame(raf); };
  }, []);
  return null;
}
