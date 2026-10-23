"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./ui";
import { ALL_STEPS, DEMO, voiceUrl } from "./demoScript";
import { api, useData, useBackClose } from "./data";

/** Admins: make the demo's natural-voice narration ahead of time (and see how much is ready). */
function VoicePrep() {
  const { perms, toast } = useData();
  const [st, setSt] = useState<{ available: boolean; ready: number; total: number } | null>(null); const [busy, setBusy] = useState(false); const [n, setN] = useState(0);
  const load = () => api<{ available: boolean; ready: number; total: number }>("/api/demo/voice?status=1").then(setSt).catch(() => undefined);
  useEffect(() => { if (perms.admin) load(); }, [perms.admin]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!perms.admin || !st) return null;
  if (!st.available) return <p className="small muted" style={{ margin: 0 }}>The demo uses the device's own voice. Add an OpenAI key (OPENAI_API_KEY) in Render for the natural voice.</p>;
  if (st.ready >= st.total && !busy) return <p className="small muted" style={{ margin: 0 }}>Natural voice ready ({st.total} parts).</p>;
  // one part at a time (short requests that can't time out), skipping parts already made
  const prep = async () => {
    setBusy(true); let failed = 0;
    for (let k = 0; k < ALL_STEPS.length; k++) { setN(k + 1); const r = await fetch(voiceUrl(ALL_STEPS[k]), { method: "GET" }).catch(() => null); if (!r || !r.ok) failed++; }
    await load(); setBusy(false); toast(failed ? `Voice prepared, but ${failed} part${failed === 1 ? "" : "s"} couldn't be made. Try again to finish them.` : "Natural voice ready", failed ? "error" : undefined);
  };
  return <div className="inline" style={{ gap: 8, flexWrap: "wrap" }}><button className="btn sm" disabled={busy} onClick={prep}>{busy ? `Preparing the voice… ${n} of ${ALL_STEPS.length}` : "Prepare the voice"}</button>
    <span className="small muted">{st.ready} of {st.total} parts ready. Preparing them now means nobody waits the first time.</span></div>;
}

type Step = [selector: string, title: string, text: string];
type Page = { key: string; title: string; help: string[]; tour: Step[] };
/** Plain-language help and a short tour for each main page. */
function pageFor(path: string, hasId: boolean): Page | null {
  if (path.startsWith("/home")) return { key: "home", title: "Home", help: ["Your day at a glance: who to contact, what's due and how the team is doing.", "Next best actions lists the most urgent step for each of your leads.", "Use + New (top right) to add a lead, task, deal or meeting from anywhere."],
    tour: [[".cockpit", "Your day", "A greeting, how much of today's follow-up work is done, and your agenda."], [".ck-next", "Next best actions", "The most urgent step for each of your leads. Click one to open the lead."], [".topbar .search", "Search", "Find any lead, company or deal. Press / to jump here, or ⌘K / Ctrl+K to jump anywhere."]] };
  if (path.startsWith("/contacts") && hasId) return { key: "lead", title: "A lead", help: ["Everything about one person: their details, where they are in the process and everything that happened.", "The card at the top suggests the next best step; one tap does it.", "Use the buttons under the details to email, log a call, book a meeting or record a voice note.", "Everything you log appears on the timeline, which you can filter by kind."],
    tour: [[".nba-wrap", "Next best action", "What to do next with this lead, and why. Do it, make it a task, or snooze it."], [".stage-track", "Stage", "Where this lead is on the way to a deal. Click a step to move them there."], [".actions.dock", "Actions", "Write an email, log a call, book a meeting or record a voice note. These stay in reach as you scroll."], [".tl-filter", "Timeline", "Everything that happened, newest first. Tap a chip to show just emails, calls, notes and so on."]] };
  if (path.startsWith("/contacts")) return { key: "contacts", title: "Contacts", help: ["All your leads as cards or a list.", "Quick views (Hot, New, Meeting set…) narrow the list in one tap; Filters has the rest.", "Open a lead, then use ‹ › to step through the list without going back."],
    tour: [[".quick", "Quick views", "One tap to see hot leads, new ones, meetings set and more."], [".dir-tools", "Search, sort and filters", "Find someone, change the order, or open Filters for more options."], [".vt", "Cards or list", "Switch between cards and a compact list. Your choice is remembered."]] };
  if (path.startsWith("/deals")) return { key: "deals", title: "Deals", help: ["Your pipeline by stage. Drag a card to move a deal.", "Pick a period to see deals closing in it, with the totals and a breakdown by month, quarter or year.", "Open a deal to edit it, record payments and see its history."],
    tour: [[".periods", "Period", "Show deals by their close date: this month, last quarter, year to date and more."], [".pipe", "Pipeline", "Drag a deal to another column to move it. Click it to open."], [".dperiods", "Closed by period", "Won, lost, win rate and money received, by month, quarter or year."]] };
  if (path.startsWith("/billing")) return { key: "billing", title: "Billing and contracts", help: ["Every invoice to raise or collect, and every signed SOW.", "Attach a SOW and AI reads its payment terms into invoice reminders.", "Ask accounts to invoice in one click; mark invoices paid to record the money on the deal."],
    tour: [[".bill-tabs", "Invoices and contracts", "Invoices to raise and collect, or every signed SOW."], [".dir-tools", "Add", "Attach a SOW (AI reads the payment terms) or add a billing item by hand."], [".quick", "What's due", "Due this month, overdue, requested, awaiting payment, paid and renewals."]] };
  if (path.startsWith("/reports")) return { key: "reports", title: "Reports", help: ["Overview has the main numbers. Report builder makes your own reports; save them, share them, or email them on a schedule.", "Dashboards put saved reports on one page with a private link for leadership."],
    tour: [[".rep-tabs", "Three tabs", "The overview, the report builder, and shareable dashboards."]] };
  if (path.startsWith("/calendar")) return { key: "calendar", title: "Calendar", help: ["Tasks, follow-ups, meetings, events, deal close dates and invoices by day.", "Drag a task or follow-up to another day to move it."], tour: [] };
  if (path.startsWith("/tasks")) return { key: "tasks", title: "Tasks", help: ["Tasks assigned to you, ones you're tagged on, and ones you created.", "Open a task to discuss it with the team and attach files."], tour: [] };
  return null;
}
const SHORTCUTS: [string, string][] = [["/", "Search"], ["⌘K or Ctrl+K", "Jump to anything"], ["N", "New lead"], ["T", "New task"], ["G then H", "Go to Home"], ["G then C", "Go to Contacts"],
  ["G then D", "Go to Deals"], ["G then B", "Go to Billing and contracts"], ["G then R", "Go to Reports"], ["G then K", "Go to Calendar"], ["E", "Write an email (on a lead)"], ["L", "Log a call (on a lead)"],
  ["M", "Book a meeting (on a lead)"], ["V", "Record a voice note (on a lead)"], ["?", "Show help and shortcuts"]];

function Tour({ steps, onDone }: { steps: Step[]; onDone: () => void }) {
  const [i, setI] = useState(0); const [box, setBox] = useState<DOMRect | null>(null);
  const live = steps.filter(([s]) => typeof document !== "undefined" && document.querySelector(s));
  const step = live[i];
  useEffect(() => {
    if (!step) return; const el = document.querySelector(step[0]) as HTMLElement | null; if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = setTimeout(() => setBox(el.getBoundingClientRect()), 350);
    const r = () => setBox(el.getBoundingClientRect()); window.addEventListener("resize", r); window.addEventListener("scroll", r, true);
    return () => { clearTimeout(t); window.removeEventListener("resize", r); window.removeEventListener("scroll", r, true); };
  }, [step]);
  if (!step || !box) return null;
  const below = box.bottom + 190 < window.innerHeight; const left = Math.max(12, Math.min(window.innerWidth - 332, box.left));
  return <>
    <div className="tour-ring" style={{ top: box.top - 6, left: box.left - 6, width: box.width + 12, height: box.height + 12 }} aria-hidden="true" />
    <div className="tour-tip" role="dialog" aria-label="Tour" style={{ top: below ? box.bottom + 12 : Math.max(12, box.top - 172), left }}>
      <div className="small muted">{i + 1} of {live.length}</div><b>{step[1]}</b><p>{step[2]}</p>
      <div className="tour-btns"><button className="linkbtn small" onClick={onDone}>Skip</button><span style={{ flex: 1 }} />
        {i > 0 && <button className="btn sm ghost" onClick={() => setI(i - 1)}>Back</button>}
        <button className="btn sm primary" onClick={() => (i + 1 < live.length ? setI(i + 1) : onDone())}>{i + 1 < live.length ? "Next" : "Done"}</button></div>
    </div></>;
}

/** The ? help button and panel, guided tours, and keyboard shortcuts. Mounted once in the app's shell. */
export function HelpAndShortcuts() {
  const path = usePathname() || ""; const sp = useSearchParams(); const router = useRouter();
  const page = pageFor(path, !!sp.get("id"));
  const [open, setOpen] = useState(false); const [touring, setTouring] = useState(false); useBackClose(open, () => setOpen(false));
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [open]);
  const gAt = useRef(0);
  // a tour starts once, the first time someone opens a page that has one (not for automated browsers)
  useEffect(() => {
    if (!page?.tour.length || (typeof navigator !== "undefined" && navigator.webdriver)) return;
    let seen = true; try { seen = localStorage.getItem(`lt-tour-${page.key}`) === "1"; } catch { /* ignore */ }
    if (!seen) { const t = setTimeout(() => setTouring(true), 1200); return () => clearTimeout(t); }
  }, [page?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const doneTour = () => { setTouring(false); try { if (page) localStorage.setItem(`lt-tour-${page.key}`, "1"); } catch { /* ignore */ } };
  const click = (text: string) => { const b = [...document.querySelectorAll<HTMLButtonElement>(".actions.dock button, .actions button")].find((x) => x.textContent?.includes(text)); b?.click(); return !!b; };
  const onKey = useCallback((e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (e.metaKey || e.ctrlKey || e.altKey || t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || document.querySelector("dialog[open]")) return;
    const k = e.key.toLowerCase();
    if (Date.now() - gAt.current < 1500) {
      const to: Record<string, string> = { h: "/home", c: "/contacts", d: "/deals", b: "/billing", r: "/reports", k: "/calendar", t: "/tasks", f: "/followups" };
      gAt.current = 0; if (to[k]) { e.preventDefault(); router.push(to[k]); } return;
    }
    if (k === "g") { gAt.current = Date.now(); return; }
    if (e.key === "/") { const s = document.querySelector<HTMLInputElement>(".topbar .search input"); if (s) { e.preventDefault(); s.focus(); } return; }
    if (e.key === "?") { e.preventDefault(); setOpen(true); return; }
    if (k === "n") { e.preventDefault(); window.dispatchEvent(new CustomEvent("lt:new", { detail: "contact" })); return; }
    if (k === "t") { e.preventDefault(); window.dispatchEvent(new CustomEvent("lt:new", { detail: "task" })); return; }
    if (path.startsWith("/contacts") && sp.get("id")) {
      const map: Record<string, string> = { e: "Write email", l: "Log call", m: "Book meeting", v: "Voice note" };
      if (map[k] && click(map[k])) e.preventDefault();
    }
  }, [path, sp, router]);
  useEffect(() => { window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onKey]);
  useEffect(() => { const f = () => setOpen(true); window.addEventListener("lt:help", f); return () => window.removeEventListener("lt:help", f); }, []);
  return <>
    {touring && page && <Tour steps={page.tour} onDone={doneTour} />}
    {open && <div className="help-sheet" role="dialog" aria-label="Help" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="help-panel">
        <p className="small muted help-ver">Version: {process.env.NEXT_PUBLIC_BUILT_AT ? new Date(process.env.NEXT_PUBLIC_BUILT_AT).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "development"}</p>
        <div className="help-h"><b>{page ? `Help: ${page.title}` : "Help"}</b><button className="btn ghost sm" onClick={() => setOpen(false)}>Close</button></div>
        {page && <ul className="help-list">{page.help.map((h, i) => <li key={i}>{h}</li>)}</ul>}
        <div className="demo-start">
          <button className="btn primary" onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent("lt:demo", { detail: {} })); }}>▶ Watch the demo</button>
          <span className="small muted">A narrated walk through the whole app, about 12 minutes. Or start at a chapter:</span>
          <div className="chips" style={{ marginTop: 0 }}>{DEMO.map((c, ci) => <button key={ci} type="button" className="chip" onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent("lt:demo", { detail: { chapter: ci } })); }}>{ci + 1}. {c.title}</button>)}</div>
          <VoicePrep />
        </div>
        {page?.tour.length ? <button className="btn" onClick={() => { setOpen(false); setTimeout(() => setTouring(true), 200); }}><Icon name="help" size={15} /> Quick tour of this page</button> : null}
        <h3 className="section-h">Keyboard shortcuts</h3>
        <dl className="kbd-list">{SHORTCUTS.map(([k, d]) => <div key={k}><dt>{k.split(" then ").map((x, i) => <span key={i}>{i ? " then " : ""}<kbd>{x}</kbd></span>)}</dt><dd>{d}</dd></div>)}</dl>
        <p className="small muted" style={{ margin: 0 }}>Shortcuts don't work while you're typing in a box.</p>
      </div></div>}
  </>;
}
