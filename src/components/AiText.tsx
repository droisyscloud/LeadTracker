"use client";
import { useEffect, useRef, useState } from "react";
import { api, useData } from "./data";

type Action = "polish" | "grammar" | "formal" | "friendly" | "shorter" | "longer" | "bullets" | "custom";
const ACTIONS: [Action, string][] = [["polish", "Polish"], ["grammar", "Fix grammar"], ["formal", "More formal"], ["friendly", "Friendlier"], ["shorter", "Shorter"], ["longer", "Expand"], ["bullets", "Bullet points"]];
type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { kind?: string; ref?: React.Ref<HTMLTextAreaElement> };

/**
 * A normal text box with "✦ AI" underneath: polish, fix grammar, make formal or friendlier, shorten, expand,
 * turn into bullets, or follow your own instruction. The result replaces the text, with Undo.
 */
export function AiText({ kind = "note", ref, ...props }: Props) {
  const { m, toast } = useData();
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState<Action | "">(""); const [ask, setAsk] = useState("");
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [open]);
  const [undo, setUndo] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const value = String(props.value ?? "");
  useEffect(() => { const f = (e: MouseEvent) => { if ((e.target as Element)?.closest?.(".demo-layer")) return; if (box.current && !box.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("pointerdown", f); return () => document.removeEventListener("pointerdown", f); }, []);
  useEffect(() => { if (undo === null) return; const t = setTimeout(() => setUndo(null), 20000); return () => clearTimeout(t); }, [undo]);
  // tell the parent about the new text the same way typing would
  const emit = (v: string) => props.onChange?.({ target: { value: v }, currentTarget: { value: v } } as unknown as React.ChangeEvent<HTMLTextAreaElement>);
  const go = async (action: Action) => {
    if (!value.trim()) { toast("Write something first, then AI can polish it.", "info"); return; }
    setBusy(action);
    try {
      const r = await api<{ text: string }>("/api/ai/rewrite", { json: { text: value, action, instruction: action === "custom" ? ask : "", kind } });
      setUndo(value); emit(r.text); setOpen(false); setAsk("");
    } catch (e) { toast(e instanceof Error ? e.message : "AI couldn't rewrite that.", "error"); }
    setBusy("");
  };
  const enabled = m.config.ai && m.me.role !== "viewer" && !props.disabled && !props.readOnly;
  return <div className="aitext" ref={box}>
    <textarea ref={ref} {...props} />
    {enabled && <div className="aitext-bar">
      {undo !== null && <button type="button" className="linkbtn small" onClick={() => { emit(undo); setUndo(null); }}>↶ Undo AI</button>}
      <button type="button" className="aitext-btn" aria-expanded={open} disabled={!!busy} onClick={() => setOpen(!open)} title="Polish, fix or rewrite this text with AI">
        {busy ? "✦ Working…" : "✦ AI"}</button>
      {open && <div className="aitext-menu" role="menu">
        {ACTIONS.map(([a, l]) => <button key={a} type="button" role="menuitem" disabled={!!busy || !value.trim()} onClick={() => go(a)}>{l}</button>)}
        <div className="aitext-ask">
          <input type="text" value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Or tell AI what to change…" aria-label="Tell AI what to change"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (ask.trim()) go("custom"); } }} />
          <button type="button" className="btn primary sm" disabled={!!busy || !ask.trim() || !value.trim()} onClick={() => go("custom")}>Go</button>
        </div>
        {!value.trim() && <p className="small muted" style={{ margin: "6px 4px 0" }}>Write something first.</p>}
      </div>}
    </div>}
  </div>;
}
