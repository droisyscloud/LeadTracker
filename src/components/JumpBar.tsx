"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useData, useBackClose, CloseX } from "./data";
import { Icon } from "./ui";
import { coName, STAGE_LABEL } from "./model";

type Item = { id: string; group: "Actions" | "Leads" | "Companies" | "Deals" | "Pages"; label: string; sub?: string; icon: string; run: () => void; keys: string };
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
/** Simple fuzzy match: every typed word must appear; earlier and word-start matches rank higher. */
function rank(q: string, hay: string) {
  const words = norm(q).split(/\s+/).filter(Boolean); const h = norm(hay); let s = 0;
  for (const w of words) { const i = h.indexOf(w); if (i < 0) return -1; s += (i === 0 ? 30 : h[i - 1] === " " ? 20 : 5) - Math.min(i, 20) / 4; }
  return s;
}

/**
 * The Jump bar: ⌘K / Ctrl+K from anywhere. Find any lead, company, deal or page, or start an action,
 * using just the keyboard.
 */
export function JumpBar() {
  const { m, perms } = useData(); const router = useRouter();
  const [open, setOpen] = useState(false); const [q, setQ] = useState(""); const [sel, setSel] = useState(0); useBackClose(open, () => setOpen(false));
  const input = useRef<HTMLInputElement>(null); const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "Escape") setOpen(false);
    };
    const jump = () => setOpen(true);
    window.addEventListener("keydown", key); window.addEventListener("lt:jump", jump);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("lt:jump", jump); };
  }, []);
  useEffect(() => { if (open) { setQ(""); setSel(0); setTimeout(() => input.current?.focus(), 10); } }, [open]);

  const go = (href: string) => () => router.push(href);
  const act = (what: string) => () => window.dispatchEvent(new CustomEvent("lt:new", { detail: what }));
  const all = useMemo<Item[]>(() => {
    const out: Item[] = [];
    if (perms.write) {
      out.push({ id: "a-contact", group: "Actions", label: "New contact", icon: "plus", run: act("contact"), keys: "add lead person create" },
        { id: "a-company", group: "Actions", label: "New company", icon: "companies", run: act("company"), keys: "add organisation create" },
        { id: "a-deal", group: "Actions", label: "New deal", icon: "deals", run: act("deal"), keys: "add opportunity create" },
        { id: "a-task", group: "Actions", label: "New task", icon: "tasks", run: act("task"), keys: "add todo create reminder" },
        { id: "a-demo", group: "Actions", label: "Watch the demo (narrated tour)", icon: "help", run: () => window.dispatchEvent(new CustomEvent("lt:demo", { detail: {} })), keys: "tour help guide video walkthrough" },
        { id: "a-quick", group: "Actions", label: "Quick add a lead on the phone", icon: "camera", run: go("/quick"), keys: "scan badge photo qr offline" },
        { id: "a-import", group: "Actions", label: "Import contacts from a spreadsheet", icon: "upload", run: () => window.dispatchEvent(new CustomEvent("lt:import")), keys: "csv excel upload import" });
      if (m.connection) out.push({ id: "a-meet", group: "Actions", label: "Book a meeting", icon: "calendar", run: act("meeting"), keys: "schedule invite call meet" });
    }
    const pages: [string, string, string, boolean][] = [["/home", "Home", "home", true], ["/followups", "Follow-ups", "followups", true], ["/tasks", "Tasks", "tasks", true], ["/calendar", "Calendar", "calendar", true],
      ["/contacts", "Contacts", "contacts", true], ["/companies", "Companies", "companies", true], ["/deals", "Deals", "deals", true], ["/billing", "Billing and contracts", "invoice", true], ["/sequences", "Sequences", "sequences", true],
      ["/events", "Events", "events", true], ["/products", "Products", "products", true], ["/content", "Content (tracked documents)", "note", true], ["/reports", "Reports", "reports", true], ["/teams", "Teams", "teams", perms.manage],
      ["/team", "Users and access", "team", perms.admin], ["/audit", "Audit history", "list", perms.admin], ["/trash", "Recycle bin", "trash", perms.write], ["/settings", "Settings", "settings", perms.manage], ["/account", "Your account", "user", true]];
    for (const [href, label, icon, ok] of pages) if (ok) out.push({ id: `p-${href}`, group: "Pages", label, icon, run: go(href), keys: "go page open" });
    for (const c of m.contacts) out.push({ id: `c-${c.id}`, group: "Leads", label: c.name, sub: [c.title, coName(m, c), STAGE_LABEL[c.status]].filter(Boolean).join(" · "), icon: "contacts", run: go(`/contacts?id=${c.id}`), keys: `${c.email} ${c.phone} ${coName(m, c)}` });
    for (const c of m.companies) out.push({ id: `o-${c.id}`, group: "Companies", label: c.name, sub: c.website || undefined, icon: "companies", run: go(`/companies?id=${c.id}`), keys: c.website || "" });
    for (const d of m.deals) out.push({ id: `d-${d.id}`, group: "Deals", label: d.name, sub: `${d.currency} ${Math.round(d.value).toLocaleString()} · ${d.stage}`, icon: "deals", run: go(`/deals?id=${d.id}`), keys: d.companyId ? m.companyMap.get(d.companyId)?.name || "" : "" });
    return out;
  }, [m, perms]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    if (!q.trim()) return all.filter((i) => i.group === "Actions" || i.group === "Pages").slice(0, 12);
    const order = { Actions: 4, Leads: 3, Companies: 2, Deals: 2, Pages: 1 };
    // only things that actually match; then prefer name matches, then the kind of thing
    return all.map((i) => ({ i, r: rank(q, `${i.label} ${i.sub || ""} ${i.keys}`) })).filter((x) => x.r > 0)
      .map(({ i, r }) => ({ i, s: r + order[i.group] * 2 + (rank(q, i.label) > 0 ? 25 : 0) }))
      .sort((a, b) => b.s - a.s).slice(0, 14).map((x) => x.i);
  }, [q, all]);
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [sel]);
  if (!open) return null;
  const choose = (i: Item) => { setOpen(false); i.run(); };
  let lastGroup = "";
  return <div className="jump" role="dialog" aria-modal="true" aria-label="Jump to anything" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}><CloseX onClose={() => setOpen(false)} />
    <div className="jump-box">
      <div className="jump-in"><Icon name="search" size={18} />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a lead, company, deal or page, or type an action…" aria-label="Jump to"
          onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); } else if (e.key === "Enter" && results[sel]) { e.preventDefault(); choose(results[sel]); } }} />
        <kbd>esc</kbd></div>
      <div className="jump-list" ref={list} role="listbox">
        {results.length ? results.map((i, n) => { const head = i.group !== lastGroup; lastGroup = i.group;
          return <div key={i.id}>{head && <div className="jump-g">{i.group}</div>}
            <button type="button" role="option" aria-selected={n === sel} className="jump-it" onMouseMove={() => setSel(n)} onClick={() => choose(i)}>
              <span className="jump-ic"><Icon name={i.icon} size={16} /></span><span className="jump-t"><b>{i.label}</b>{i.sub && <small>{i.sub}</small>}</span>
              {n === sel && <span className="jump-enter">↵</span>}</button></div>; })
          : <p className="jump-none">Nothing matches "{q}". Try a name, company, email or page.</p>}
      </div>
      <div className="jump-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>⌘K</kbd> or <kbd>Ctrl K</kbd> from anywhere</span></div>
    </div>
  </div>;
}
