"use client";
import { FitNumbers } from "./FitNumbers";
import { TallSections } from "./TallSections";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState, Suspense } from "react";
import { useData, useBackClose, CloseX } from "./data";
import { Avatar, Icon } from "./ui";
import { isDue, ROLE_LABEL } from "./model";
import { ContactDialog } from "./views/ContactDialog";
import { ImportDialog } from "./views/ImportDialog";
import { Bell } from "./Bell";
import { NewMenu } from "./AddNew";
import { JumpBar } from "./JumpBar";
import { HelpAndShortcuts } from "./Help";
import { DemoPlayer } from "./DemoPlayer";
import { DictationMic } from "./Voice";
import { FilePreview } from "./FilePreview";
import { AddNoteWindow } from "./Stories";
import { Agent } from "./Agent";
import { MobilePlus } from "./Mobile";
import { PracticeBanner } from "./Practice";
import { ScopePill } from "./ScopeToggle";

const NAV: [string, string, string, boolean?][] = [["/home", "Home", "home"], ["/followups", "Follow-ups", "followups"], ["/tasks", "Tasks", "tasks"], ["/calendar", "Calendar", "calendar"], ["/contacts", "Contacts", "contacts"],
  ["/notes", "Notes", "note"], ["/companies", "Companies", "companies"], ["/deals", "Deals", "deals"], ["/billing", "Billing and contracts", "invoice"], ["/sequences", "Sequences", "sequences"], ["/events", "Events", "events"], ["/products", "Products", "products"], ["/content", "Content", "note"],
  ["/reports", "Reports", "reports"], ["/teams", "Teams", "teams", true], ["/team", "Users & access", "team"], ["/settings", "Settings", "settings", true], ["/audit", "Audit history", "list"], ["/trash", "Recycle bin", "trash"]];
/** On phones the bottom bar shows these; everything else is under More. */
const PRIMARY = ["/home", "/contacts", "/followups", "/tasks", "/notes"];   // the phone tabs; More holds only MOBILE_MORE
const MOBILE_MORE = ["/companies", "/reports", "/team", "/settings"];
/** The menu, grouped by the job you're doing. */
const GROUPS: [string, string[]][] = [["Today", ["/home", "/notes", "/followups", "/tasks", "/calendar"]], ["Pipeline", ["/contacts", "/companies", "/deals", "/billing"]],
  ["Outreach", ["/sequences", "/events", "/products", "/content"]], ["Insights", ["/reports", "/teams"]], ["Admin", ["/team", "/settings", "/audit", "/trash"]]];

export function Shell({ children, signOutAction }: { children: ReactNode; signOutAction: () => Promise<void> }) {
  const { m, q, setQ, perms } = useData();
  const path = usePathname();
  const NAVS = NAV; const GROUPSS = GROUPS; const PRIMARYS = PRIMARY;
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [add, setAdd] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  useEffect(() => { const f = () => setNoteOpen(true); window.addEventListener("lt:addnote", f); return () => window.removeEventListener("lt:addnote", f); }, []);
  const [offline, setOffline] = useState(false); const [howTo, setHowTo] = useState(false); const [installed, setInstalled] = useState(true);
  const promptRef = useRef<{ prompt: () => Promise<void> } | null>(null);
  useEffect(() => {
    setOffline(!navigator.onLine); setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
    const on = () => setOffline(false), off = () => setOffline(true);
    const bip = (e: Event) => { e.preventDefault(); promptRef.current = e as unknown as { prompt: () => Promise<void> }; };
    window.addEventListener("online", on); window.addEventListener("offline", off); window.addEventListener("beforeinstallprompt", bip);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); window.removeEventListener("beforeinstallprompt", bip); };
  }, []);
  const topRef = useRef<HTMLDivElement>(null);
  // the menu can collapse to a slim rail; remembered on this device
  const [rail, setRailState] = useState(false);
  useEffect(() => { try { setRailState(localStorage.getItem("lt-rail") === "1"); } catch { /* ignore */ } }, []);
  const setRail = (v: boolean) => { setRailState(v); try { localStorage.setItem("lt-rail", v ? "1" : "0"); } catch { /* ignore */ } };
  const navRef = useRef<HTMLElement>(null);
  // the signal indicator glides to the current menu item
  useEffect(() => {
    const nav = navRef.current; if (!nav) return;
    const place = () => {
      const a = nav.querySelector<HTMLElement>('.nav-item[aria-current="true"]');
      if (!a) { nav.style.setProperty("--ind-o", "0"); return; }
      nav.style.setProperty("--ind-y", `${a.offsetTop}px`); nav.style.setProperty("--ind-h", `${a.offsetHeight}px`); nav.style.setProperty("--ind-o", "1");
    };
    place(); const ro = new ResizeObserver(place); ro.observe(nav);
    return () => ro.disconnect();
  }, [path]);
  // light that follows the pointer across panels (one listener for the whole page)
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || window.matchMedia("(hover: none)").matches) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const p = (e.target as HTMLElement)?.closest?.(".panel") as HTMLElement | null; if (!p) return;
        const r = p.getBoundingClientRect(); p.style.setProperty("--mx", `${e.clientX - r.left}px`); p.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => { window.removeEventListener("pointermove", move); cancelAnimationFrame(raf); };
  }, []);
  useEffect(() => {
    const el = topRef.current; if (!el) return;
    const set = () => document.documentElement.style.setProperty("--topbar-h", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    set(); const ro = new ResizeObserver(set); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const install = async () => { if (promptRef.current) { await promptRef.current.prompt(); promptRef.current = null; } else setHowTo(true); };
  const [imp, setImp] = useState(false);
  const [more, setMore] = useState(false); useBackClose(more, () => setMore(false));
  useEffect(() => { setMore(false); }, [path]);
  useEffect(() => { const f = () => setImp(true); window.addEventListener("lt:import", f); return () => window.removeEventListener("lt:import", f); }, []);
  const menuRef = useRef<HTMLDivElement>(null);
  const due = m.contacts.filter((c) => isDue(m, c)).length;
  const tasksDue = m.tasks.filter((t) => !t.done && t.assigneeId === m.me.id && !!t.dueDate && t.dueDate <= new Date().toLocaleDateString("en-CA")).length;
  const title = NAVS.find((n) => (n[0] === "/team" ? path === "/team" : path.startsWith(n[0])))?.[1] || (path.startsWith("/account") ? "Account" : m.config.brand.appName);
  useEffect(() => { const f = (e: MouseEvent) => { if ((e.target as Element)?.closest?.(".demo-layer")) return; if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); }; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("pointerdown", f); document.addEventListener("keydown", k); return () => { document.removeEventListener("pointerdown", f); document.removeEventListener("keydown", k); }; }, []);   // tap anywhere else (mouse or finger) or Escape closes it
  // appearance: light, dark, or follow the device (automatic); remembered on this device
  const [theme, setThemeState] = useState<"light" | "dark" | "auto">("auto");
  useEffect(() => { try { const t = localStorage.getItem("lt-theme"); setThemeState(t === "dark" || t === "auto" ? t : "light"); } catch { /* ignore */ } }, []);   // light unless you chose otherwise
  const setTheme = (t: "light" | "dark" | "auto") => {
    setThemeState(t); const el = document.documentElement;
    if (t === "auto") { el.removeAttribute("data-theme"); try { localStorage.setItem("lt-theme", "auto"); } catch { /* ignore */ } }
    else { el.setAttribute("data-theme", t); try { localStorage.setItem("lt-theme", t); } catch { /* ignore */ } }
  };
  return (
    <>
      <div className="aurora" aria-hidden="true"><i /><i /><i /></div><div className="grain" aria-hidden="true" />
      <div className={"app" + (rail ? " rail" : "") + " in-sales"}>
      <span className="app-strip" aria-hidden="true" />
      <DictationMic />
      <FilePreview />
      <aside className="side">
        <div className="brand"><img className="logo" src="/api/public/brand/logo" alt={m.config.brand.companyName} /><img className="logo-mark" src="/api/public/brand/mark" alt={m.config.brand.companyName} /><b>{m.config.brand.appName.toUpperCase()}</b>
          <button type="button" className="rail-toggle" onClick={() => setRail(!rail)} aria-label={rail ? "Show the full menu" : "Collapse the menu"} title={rail ? "Show the full menu" : "Collapse the menu"}>{rail ? "»" : "«"}</button></div>
        <nav className="nav" aria-label="Sections" ref={navRef}>
          <span className="nav-ind" aria-hidden="true" />
          {GROUPSS.map(([group, hrefs]) => { const items = NAVS.filter((n) => hrefs.includes(n[0]) && (!n[3] || perms.manage) && (n[0] !== "/team" || perms.admin) && (n[0] !== "/audit" || perms.admin) && (n[0] !== "/trash" || perms.write) && (n[0] !== "/billing" || perms.billing));
            return items.length ? <div key={group} className="nav-group"><div className="nav-gl">{group}</div>
              {items.map(([href, label, icon]) => (
                <Link key={href} href={href} className={"nav-item" + (PRIMARYS.includes(href) ? " primary" : "")} title={rail ? label : undefined} aria-current={(href === "/team" ? path === "/team" : path.startsWith(href)) ? "true" : "false"}>
                  <Icon name={icon} /><span>{label}</span>{href === "/followups" && due > 0 && <span className="cnt">{due}</span>}{href === "/tasks" && tasksDue > 0 && <span className="cnt">{tasksDue}</span>}
                </Link>))}</div> : null; })}
          <button type="button" className="nav-item nav-more" aria-expanded={more} onClick={() => setMore(!more)}><Icon name="list" /><span>More</span></button>
        </nav>
        <div className="spacer" />
        <Link href="/account" className="me" style={{ textDecoration: "none" }}>
          <Avatar name={m.me.name || m.me.email} image={m.me.image} />
          <div style={{ minWidth: 0 }}><b>{m.me.name || m.me.email}</b><span className="role">{ROLE_LABEL[m.me.role]}</span></div>
        </Link>
      </aside>
      <div className="main">
        {m.config.practice && <PracticeBanner />}
        <div className="topbar" ref={topRef}>
          <span className="trace" key={path} aria-hidden="true" />
          <h1>{title}</h1>
          <label className="search"><Icon name="search" size={16} />
            <input type="search" placeholder="Search or jump (⌘K)" aria-label="Search" value={q}
              onChange={(e) => { setQ(e.target.value); if (e.target.value && !/^\/(contacts|companies|products)/.test(path)) router.push("/contacts"); }} />
          </label>
          <ScopePill />
          <button className="btn mjump" onClick={() => window.dispatchEvent(new CustomEvent("lt:jump"))} aria-label="Search"><Icon name="search" size={16} /></button>
          {perms.write && <button className="btn addnote-top" onClick={() => setNoteOpen(true)} aria-label="Add note"><Icon name="note" size={16} /><span className="lbl keep">Add note</span></button>}
          <NewMenu />
          <button type="button" className="btn icon help-btn" aria-label="Help and shortcuts" title="Help and shortcuts (?)" onClick={() => window.dispatchEvent(new CustomEvent("lt:help"))}>?</button>
          <Bell />
          <div className="acctwrap" ref={menuRef}>
            <button className="acct" aria-label="Account menu" aria-expanded={menu} onClick={() => setMenu(!menu)}><Avatar name={m.me.name || m.me.email} image={m.me.image} size={36} /></button>
            {menu && <div className="menu-backdrop" aria-hidden="true" onClick={() => setMenu(false)} />}
            {menu && (
              <div className="menu profile-card" role="menu" aria-label="Your profile">
                <div className="sheet-grab" aria-hidden="true" />
                <div className="pc-head">
                  <Avatar name={m.me.name || m.me.email} image={m.me.image} size={52} />
                  <div className="pc-id"><b>{m.me.name || m.me.email.split("@")[0]}</b><span>{m.me.email}</span><span className="role">{ROLE_LABEL[m.me.role]}</span></div>
                </div>
                <div className="pc-theme" role="group" aria-label="Appearance">
                  {(["light", "dark", "auto"] as const).map((t) => <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)}>
                    <Icon name={t === "light" ? "sun" : t === "dark" ? "moon" : "auto"} size={15} />{t === "light" ? "Light" : t === "dark" ? "Dark" : "Automatic"}</button>)}
                </div>
                <div className="pc-sec">Your account</div>
                <Link className="mi" href="/account" onClick={() => setMenu(false)}><Icon name="user" size={17} /><span>Account, notifications and booking page</span></Link>
                {perms.admin && <Link className="mi" href="/team" onClick={() => setMenu(false)}><Icon name="team" size={17} /><span>Users &amp; access</span></Link>}
                <div className="pc-sec">Tools</div>
                <button className="mi" onClick={() => { setMenu(false); window.dispatchEvent(new CustomEvent("lt:jump")); }}><Icon name="search" size={17} /><span>Jump to anything</span><kbd>⌘K</kbd></button>
                {perms.write && <Link className="mi" href="/quick" onClick={() => setMenu(false)}><Icon name="camera" size={17} /><span>Quick add (works offline)</span></Link>}
                {perms.write && <button className="mi" onClick={() => { setMenu(false); setImp(true); }}><Icon name="upload" size={17} /><span>Import contacts</span></button>}
                {perms.export && <a className="mi" href="/api/export" onClick={() => setMenu(false)}><Icon name="download" size={17} /><span>Export everything (CSV)</span></a>}
                {!installed && <button className="mi" onClick={() => { setMenu(false); install(); }}><Icon name="download" size={17} /><span>Install the app on this device</span></button>}
                <form action={signOutAction} className="pc-out"><button className="mi" type="submit"><Icon name="logout" size={17} /><span>Sign out</span></button></form>
              </div>
            )}
          </div>
        </div>
        {offline && <div className="offline-bar">You're offline. Pages may not update, but <Link className="colink" href="/quick">Quick add</Link> keeps working and sends leads when you're back online.</div>}
        {howTo && <div className="banner" style={{ margin: "0 0 12px" }}><b>Install on iPhone or iPad:</b> open this site in Safari, tap the Share button, then <b>Add to Home Screen</b>. <b>On Android:</b> Chrome menu, then <b>Install app</b>. <button className="linkbtn" onClick={() => setHowTo(false)}>Close</button></div>}
        <FitNumbers /><TallSections /><div className="page-enter" key={path}>{children}</div>
        <JumpBar />
        <Suspense fallback={null}><HelpAndShortcuts /></Suspense>
        <Suspense fallback={null}><DemoPlayer /></Suspense>
      </div>
      {add && <ContactDialog onClose={() => setAdd(false)} />}
      <Agent />
      <MobilePlus />
      {noteOpen && <AddNoteWindow onClose={() => setNoteOpen(false)} onSaved={() => window.dispatchEvent(new CustomEvent("lt:notes-changed"))} />}
      {imp && <ImportDialog onClose={() => setImp(false)} />}
      {more && <div className="more-sheet" role="dialog" aria-label="All sections" onClick={(e) => { if (e.target === e.currentTarget) setMore(false); }}>
        <div className="more-panel">
          <div className="more-grab" aria-hidden="true" /><CloseX onClose={() => setMore(false)} />
          {GROUPSS.map(([group, hrefs]) => { const items = NAVS.filter((n) => hrefs.includes(n[0]) && MOBILE_MORE.includes(n[0]) && (!n[3] || perms.manage) && (n[0] !== "/team" || perms.admin) && (n[0] !== "/audit" || perms.admin) && (n[0] !== "/trash" || perms.write)).map((n) => (n[0] === "/team" ? ([n[0], "Users", n[2], n[3]] as typeof n) : n));
            return items.length ? <div key={group} className="more-group"><div className="nav-gl">{group}</div><div className="more-grid">
              {items.map(([href, label, icon]) => <Link key={href} href={href} className="more-item" aria-current={path.startsWith(href) ? "true" : "false"} onClick={() => setMore(false)}><Icon name={icon} /><span>{label}</span>
                {href === "/followups" && due > 0 && <span className="cnt">{due}</span>}{href === "/tasks" && tasksDue > 0 && <span className="cnt">{tasksDue}</span>}</Link>)}
            </div></div> : null; })}
          <button type="button" className="btn" style={{ width: "100%", marginTop: 8 }} onClick={() => setMore(false)}>Close</button>
        </div>
      </div>}
    </div>
    </>
  );
}
