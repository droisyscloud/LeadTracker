"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Photo / Card button: on a phone it asks Camera or Gallery (several at once); on a computer it opens the file
 * chooser (several at once). After a camera shot it offers "Take another", so you can snap a few in a row.
 */
export function PickImages({ icon, label, busyLabel, disabled, onFiles }: { icon: string; label: string; busyLabel?: string; disabled?: boolean; onFiles: (fs: File[]) => void }) {
  const cam = useRef<HTMLInputElement>(null); const gal = useRef<HTMLInputElement>(null); const box = useRef<HTMLSpanElement>(null);
  const [menu, setMenu] = useState(false); const [again, setAgain] = useState(false);
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  useEffect(() => { if (!menu && !again) return; const out = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) { setMenu(false); setAgain(false); } };
    document.addEventListener("pointerdown", out); return () => document.removeEventListener("pointerdown", out); }, [menu, again]);
  const got = (e: React.ChangeEvent<HTMLInputElement>, fromCam: boolean) => { const fs = [...(e.target.files || [])]; e.target.value = ""; if (!fs.length) return; onFiles(fs); setAgain(fromCam); };
  return <span className="pick" ref={box}>
    <button type="button" className="cap-b" disabled={disabled} onClick={() => { setAgain(false); if (touch) setMenu(!menu); else gal.current?.click(); }}><span>{icon}</span>{busyLabel || label}</button>
    {menu && <span className="pick-menu" role="menu" aria-label={`Add a ${label.toLowerCase()}`}>
      <button type="button" role="menuitem" onClick={() => { setMenu(false); cam.current?.click(); }}>📷 Camera</button>
      <button type="button" role="menuitem" onClick={() => { setMenu(false); gal.current?.click(); }}>🖼 Gallery <small>(choose several)</small></button></span>}
    {again && <span className="pick-menu" role="menu" aria-label="Take another">
      <button type="button" role="menuitem" onClick={() => { setAgain(false); cam.current?.click(); }}>📷 Take another</button>
      <button type="button" role="menuitem" onClick={() => setAgain(false)}>Done</button></span>}
    <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => got(e, true)} aria-label={`Take a ${label.toLowerCase()} with the camera`} />
    <input ref={gal} type="file" accept="image/*" multiple hidden onChange={(e) => got(e, false)} aria-label={`Choose ${label.toLowerCase()}s from your gallery or files`} />
  </span>;
}
