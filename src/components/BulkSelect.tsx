"use client";
import { useEffect, useRef, useState } from "react";
import { api, useData } from "./data";

/**
 * "☐ Select" for any list: while selecting, tapping a card or row (anything marked data-sel-id) ticks it instead of
 * opening it. Then Delete removes them all through the normal delete (recycle bin and permissions apply).
 */
export function BulkSelect({ kind, noun, ids, children, expand, selectLabel }: { kind: "contact" | "company" | "deal" | "note" | "product"; noun: [string, string]; ids: string[]; children: React.ReactNode;
  /** when the ticked items stand for groups (an event's notes), turn them into what's actually deleted */ expand?: (picked: string[]) => string[]; selectLabel?: string }) {
  const { m, perms, reload, toast } = useData(); const [sel, setSel] = useState<Set<string> | null>(null); const [busy, setBusy] = useState(false); const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = box.current; if (!el) return; el.querySelectorAll<HTMLElement>("[data-sel-id]").forEach((x) => { if (sel) x.setAttribute("data-picked", sel.has(x.dataset.selId!) ? "true" : "false"); else x.removeAttribute("data-picked"); }); });
  if (!perms.write) return <>{children}</>;
  const word = (n: number) => `${n} ${n === 1 ? noun[0] : noun[1]}`;
  const doDelete = async () => { if (!sel?.size) return; const n = sel.size;
    const del = expand ? expand([...sel]) : [...sel];
    if (expand && !del.length) { toast("There are no notes of yours in those to delete.", "error"); return; }
    const what = expand ? `all ${del.length} of your note${del.length === 1 ? "" : "s"} in ${word(n)}` : word(n);
    if (!confirm(kind === "note" ? `Delete ${what}? This can't be undone.` : `Delete ${what}? They go to the recycle bin, where you can restore them.`)) return;
    // companies that still have people: delete the people too, or only the empty companies
    const ppl = kind === "company" ? m.contacts.filter((c) => c.companyId && sel.has(c.companyId)).length : 0;
    const withPeople = ppl > 0 && confirm(`Also delete the ${ppl} ${ppl === 1 ? "person" : "people"} at these companies?\n\nOK: delete the companies and their people (all go to the recycle bin).\nCancel: delete only the companies with nobody in them.`);
    setBusy(true);
    try { const r = await api<{ done: number; people?: number; failed: { reason: string }[] }>("/api/bulk-delete", { json: { kind, ids: del, withPeople } });
      const extra = r.people ? ` and ${r.people} ${r.people === 1 ? "person" : "people"}` : "";
      const doneWord = expand ? `${r.done} note${r.done === 1 ? "" : "s"}` : word(r.done); const after = kind === "note" ? "" : " Restore them from the recycle bin if you need to.";
      toast(r.failed.length ? `Deleted ${doneWord}${extra}. ${r.failed.length} couldn't be deleted: ${r.failed[0].reason}` : `Deleted ${doneWord}${extra}.${after}`, r.failed.length ? "error" : undefined);
      setSel(null); reload(); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't delete them.", "error"); } finally { setBusy(false); } };
  return <>
    <div className="bulkbar">{sel ? <><b className="small">{sel.size} selected</b>
        <button type="button" className="btn sm danger-outline" disabled={!sel.size || busy} onClick={doDelete}>{busy ? "Deleting…" : expand ? "Delete notes" : "Delete"}</button>
        <button type="button" className="linkbtn small" onClick={() => setSel(new Set(ids))}>Select all ({ids.length})</button>
        {sel.size > 0 && <button type="button" className="linkbtn small" onClick={() => setSel(new Set())}>Clear</button>}
        <button type="button" className="linkbtn small" onClick={() => setSel(null)}>Cancel</button></>
      : <button type="button" className="btn sm ghost" onClick={() => setSel(new Set())}>☐ {selectLabel || "Select"}</button>}</div>
    <div ref={box} className={sel ? "bulk-on" : undefined} onClickCapture={(e) => { if (!sel) return; const it = (e.target as Element).closest<HTMLElement>("[data-sel-id]"); if (!it) return;
      e.preventDefault(); e.stopPropagation(); const id = it.dataset.selId!; setSel((s) => { const n = new Set(s || []); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }}>{children}</div>
  </>;
}
