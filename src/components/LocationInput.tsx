"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "./data";

type Place = { label: string };
/** A location box that suggests places from around the world as you type. You can still type anything. */
export function LocationInput({ value, onChange, placeholder = "City, region or country", label = "Location", disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string; disabled?: boolean }) {
  const [list, setList] = useState<Place[]>([]); const [open, setOpen] = useState(false); const [sel, setSel] = useState(-1); const [busy, setBusy] = useState(false);
  const typed = useRef(false); const seq = useRef(0);
  useEffect(() => {
    if (!typed.current) return;
    const q = value.trim(); if (q.length < 2) { setList([]); return; }
    const n = ++seq.current; setBusy(true);
    const t = setTimeout(() => {
      api<{ places: Place[] }>(`/api/geo/suggest?q=${encodeURIComponent(q)}`).then((r) => { if (n === seq.current) { setList(r.places); setSel(-1); setOpen(true); } })
        .catch(() => undefined).finally(() => { if (n === seq.current) setBusy(false); });
    }, 250);
    return () => clearTimeout(t);
  }, [value]);
  const pick = (p: Place) => { typed.current = false; onChange(p.label); setOpen(false); setList([]); };
  return <div className="loc">
    <input type="text" value={value} disabled={disabled} placeholder={placeholder} aria-label={label} autoComplete="off" role="combobox" aria-expanded={open && list.length > 0} aria-autocomplete="list"
      onChange={(e) => { typed.current = true; onChange(e.target.value); }} onFocus={() => list.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
      onKeyDown={(e) => {
        if (!open || !list.length) return;
        if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(list.length - 1, s + 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
        else if (e.key === "Enter" && sel >= 0) { e.preventDefault(); pick(list[sel]); }
        else if (e.key === "Escape") setOpen(false);
      }} />
    {busy && <span className="loc-busy" aria-hidden="true" />}
    {open && list.length > 0 && <div className="loc-menu" role="listbox">{list.map((p, i) => <button key={p.label} type="button" role="option" aria-selected={i === sel}
      onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}><span aria-hidden="true">📍</span> {p.label}</button>)}
      <div className="loc-attr">Places from OpenStreetMap</div></div>}
  </div>;
}
