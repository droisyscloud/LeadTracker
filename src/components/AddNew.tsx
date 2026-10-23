"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useData } from "./data";
import { Icon } from "./ui";
import { ContactDialog } from "./views/ContactDialog";
import { DealDialog, TaskDialog } from "./widgets";
import { QuickCreate, type NewKind } from "./QuickCreate";
import { BookMeetingDialog } from "./views/BookMeetingDialog";

/** "+ New" in the top bar: add anything from any page. */
export function NewMenu() {
  const { perms, m } = useData(); const router = useRouter();
  const [open, setOpen] = useState(false); const [what, setWhat] = useState<"" | NewKind | "deal" | "task" | "meeting">("");
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [open]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const f = (e: Event) => setWhat((e as CustomEvent).detail); window.addEventListener("lt:new", f); return () => window.removeEventListener("lt:new", f); }, []);
  useEffect(() => { const f = (e: MouseEvent) => { if ((e.target as Element)?.closest?.(".demo-layer")) return; if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("pointerdown", f); return () => document.removeEventListener("pointerdown", f); }, []);
  if (!perms.write) return null;
  const items: [typeof what, string, boolean][] = [["contact", "Contact", true], ["company", "Company", true], ["deal", "Deal", true], ["task", "Task", true], ["meeting", "Meeting", !!m.connection],
    ["event", "Event", perms.manage], ["product", "Product", perms.manage], ["team", "Team", perms.manage]];
  return <div className="acctwrap" ref={ref}>
    <button className="btn primary" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>+ <span className="lbl">New</span> <span aria-hidden="true" style={{ fontSize: ".7em" }}>▾</span></button>
    {open && <div className="menu-backdrop" aria-hidden="true" onClick={() => setOpen(false)} />}
    {open && <div className="menu new-menu" role="menu">
      {items.filter(([, , ok]) => ok).map(([k, l]) => <button key={k} className="mi" role="menuitem" onClick={() => { setOpen(false); setWhat(k); }}><Icon name="plus" size={16} />{l}</button>)}
      <hr /><button className="mi" role="menuitem" onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent("lt:import")); }}><Icon name="upload" size={16} />Import from a spreadsheet</button>
    </div>}
    {what === "contact" && <ContactDialog onClose={() => setWhat("")} />}
    {what === "deal" && <DealDialog onClose={() => setWhat("")} />}
    {what === "task" && <TaskDialog onClose={() => setWhat("")} />}
    {what === "meeting" && <BookMeetingDialog onClose={() => setWhat("")} />}
    {(what === "company" || what === "product" || what === "event" || what === "team") && <QuickCreate kind={what} onClose={() => setWhat("")}
      onCreated={(id) => router.push(what === "company" ? `/companies?id=${id}` : what === "team" ? `/teams?id=${id}` : what === "product" ? `/products?id=${id}` : "/events")} />}
  </div>;
}
