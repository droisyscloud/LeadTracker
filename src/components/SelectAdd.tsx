"use client";
import { Children, isValidElement, useEffect, useMemo, useRef, useState } from "react";
import { useData } from "./data";
import { ContactDialog } from "./views/ContactDialog";
import { Portal } from "./Portal";
import { LABEL, QuickCreate, type NewKind } from "./QuickCreate";

/**
 * A dropdown whose last option is "＋ New …". Choosing it opens the matching form, and the new item is
 * selected as soon as it's saved. Kinds the person isn't allowed to create don't show the option.
 * Leads, companies and any long list get a search box: type to filter instead of scrolling.
 */
export function SelectAdd({ kind, value, onChange, children, label, disabled, presetCompanyId, style, noNew }: {
  kind: NewKind; value: string; onChange: (id: string) => void; children: React.ReactNode; label?: string; disabled?: boolean; presetCompanyId?: string; style?: React.CSSProperties; noNew?: boolean;
}) {
  const { perms } = useData();
  const [open, setOpen] = useState(false);
  const allowed = !noNew && (kind === "contact" || kind === "company" ? perms.write : perms.manage);
  const opts = useMemo(() => Children.toArray(children).filter(isValidElement).map((o) => { const p = o.props as { value?: string; children?: React.ReactNode };
    return { value: String(p.value ?? ""), label: Children.toArray(p.children).map((x) => (typeof x === "string" || typeof x === "number" ? String(x) : "")).join("") }; }), [children]);
  const searchable = kind === "contact" || kind === "company" || opts.length > 12;
  return <>
    {searchable ? <SearchPick opts={opts} value={value} onPick={onChange} onNew={allowed ? () => setOpen(true) : undefined} newLabel={`＋ New ${LABEL[kind]}…`} label={label} disabled={disabled} style={style} />
      : <select aria-label={label} value={value} disabled={disabled} style={style} onChange={(e) => { if (e.target.value === "__new__") setOpen(true); else onChange(e.target.value); }}>
        {children}
        {allowed && <option value="__new__">＋ New {LABEL[kind]}…</option>}
      </select>}
    {open && <Portal>{kind === "contact"
      ? <ContactDialog presetCompanyId={presetCompanyId} onClose={() => setOpen(false)} onCreated={(c) => onChange(c.id)} />
      : <QuickCreate kind={kind} onClose={() => setOpen(false)} onCreated={onChange} />}</Portal>}
  </>;
}

type Opt = { value: string; label: string };
/** Looks like a dropdown; opens a search box with the list filtered as you type (any of the words, anywhere). */
function SearchPick({ opts, value, onPick, onNew, newLabel, label, disabled, style }: { opts: Opt[]; value: string; onPick: (v: string) => void; onNew?: () => void; newLabel: string; label?: string; disabled?: boolean; style?: React.CSSProperties }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(""); const [hi, setHi] = useState(0); const box = useRef<HTMLDivElement>(null); const inp = useRef<HTMLInputElement>(null);
  const empty = opts.find((o) => o.value === ""); const current = opts.find((o) => o.value === value && o.value !== "");
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = opts.filter((o) => o.value !== "" && words.every((w) => o.label.toLowerCase().includes(w))).slice(0, 60);
  const items: (Opt & { isNew?: boolean })[] = [...(empty && value ? [{ ...empty, label: empty.label || "None" }] : []), ...list, ...(onNew ? [{ value: "__new__", label: newLabel, isNew: true }] : [])];   // eslint-disable-line
  useEffect(() => { if (!open) return; setHi(0); setTimeout(() => inp.current?.focus(), 30);
    const out = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", out); return () => document.removeEventListener("pointerdown", out); }, [open]);
  const choose = (o: Opt & { isNew?: boolean }) => { setOpen(false); setQ(""); if (o.isNew) onNew?.(); else onPick(o.value); };
  return <div className="spick" ref={box} style={style}>
    <button type="button" className="spick-btn" aria-label={label} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen(!open)}>
      <span className={current ? "" : "muted"}>{current ? current.label : (empty?.label || "Choose…")}</span><span aria-hidden="true">▾</span></button>
    {open && <div className="spick-pop" role="dialog" aria-label={label || "Choose"}>
      <input ref={inp} type="search" value={q} placeholder="Search…" aria-label="Search" onChange={(e) => { setQ(e.target.value); setHi(0); }}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(items.length - 1, h + 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
          else if (e.key === "Enter") { e.preventDefault(); if (items[hi]) choose(items[hi]); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); } }} />
      <ul role="listbox" className="spick-list">
        {items.map((o, i) => <li key={o.value + i} role="option" aria-selected={o.value === value} className={(i === hi ? "hi " : "") + (o.isNew ? "new" : "")} onPointerDown={(e) => e.preventDefault()} onClick={() => choose(o)} onMouseEnter={() => setHi(i)}>{o.label}</li>)}
        {!list.length && q && <li className="muted none">No match for “{q}”</li>}
      </ul></div>}
  </div>;
}
