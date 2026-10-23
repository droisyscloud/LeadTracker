"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ActivityDTO, ActivityType, ContactDTO } from "@/lib/types";
import { api, useData } from "../data";
import { Avatar, ContactRow, Icon } from "../ui";
import { ago, CALL_OUT, coName, daysSince, fillTemplate, firstName, fmtPhone, isDue, isOpen, prodNames, REQ_KINDS, STAGE_LABEL, STAGES, TAGS, heatColor, lastTouch, todayStr, TYPES, userName, webHref, webLabel, type Model, followDismissed, taskLeadIds } from "../model";
import { ContactDialog } from "./ContactDialog";
import { BookMeetingDialog } from "./BookMeetingDialog";
import { TemplatesDialog } from "./TemplatesDialog";
import { MeetingNotesDialog } from "./MeetingNotesDialog";
import { Discussion } from "../thread";
import { EmailView } from "../EmailView";
import { AiWriter } from "../AiWriter";
import { NextActionCard } from "../NextActionCard";
import { InsertContentLink } from "../Content";
import { emailIssues } from "../emailCheck";
import { MeetingPrepDialog, nextMeeting } from "../MeetingPrep";
import { DirHead, Monogram, useViewMode, ViewToggle } from "../Directory";
import { activityKind, KINDS, TIMELINE_KINDS, type Kind } from "../kinds";
import { canEditActivity, ClampText, EditActivity, FullView } from "../ActivityTools";
import { ViewsBar } from "../ViewsBar";
import { SelectAdd } from "../SelectAdd";
import { AISummary } from "../AISummary";
import { DealDialog, DealList, OutcomeDialog, TaskDialog, TaskList } from "../widgets";
import { SOURCES } from "../model";
import { AiText } from "../AiText";
import { LinkedInBadge, LinkedInTools, type LiFields } from "../LinkedIn";
import { Linkify } from "../Linkify";
import { ShareButton } from "../Share";
import { LinkedNotes } from "../Stories";
import { useMobile } from "../useMobile";
import { MobileChat, MobileLeads } from "../Mobile";
import { BulkSelect } from "../BulkSelect";
import { AddressBook, SourceTabs } from "../AddressBook";

export function ContactsView() {
  const { m, q, setQ, perms } = useData();
  const sp = useSearchParams(); const mobile = useMobile();
  const router = useRouter();
  const sel = sp.get("id");
  const [stage, setStage] = useState(sp.get("stage") || "all");
  // Professional (everyone who can see it) or Personal (only you, who added them: nobody else sees these, not even admins)
  const [kind, setKind] = useState<"work" | "personal">(sp.get("kind") === "personal" ? "personal" : "work");
  const [owner, setOwner] = useState("all");
  const [product, setProduct] = useState(sp.get("product") || "all");
  const [sort, setSort] = useState(sp.get("sort") || "az");   // alphabetical by default
  const [eventF, setEventF] = useState(sp.get("event") || "all");
  const [teamF, setTeamF] = useState(sp.get("team") || "all");
  const [rating, setRating] = useState(sp.get("rating") || "all");
  const [tagF, setTagF] = useState(sp.get("tag") || "all"); const [companyF, setCompanyF] = useState(sp.get("company") || "all");
  const filters = { q, stage, owner, product, event: eventF, team: teamF, rating, tag: tagF, company: companyF, sort };
  const DEFAULTS = { q: "", stage: "all", owner: "all", product: "all", event: "all", team: "all", rating: "all", tag: "all", company: "all", sort: "az" };
  const applyView = (f: Record<string, string>) => { setQ(f.q || ""); setStage(f.stage || "all"); setOwner(f.owner || "all"); setProduct(f.product || "all"); setEventF(f.event || "all"); setTeamF(f.team || "all"); setRating(f.rating || "all"); setTagF(f.tag || "all"); setCompanyF(f.company || "all"); setSort(f.sort || "az"); };
  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const l = m.contacts.filter((c) => {
      if (kind === "personal" ? !c.personal : c.personal) return false;
      if (qq && ![c.name, coName(m, c), c.email, c.title, ...prodNames(m, c)].join(" ").toLowerCase().includes(qq)) return false;
      if (stage !== "all" && c.status !== stage) return false;
      if (owner === "mine" && c.ownerId !== m.me.id) return false;
      if (owner === "none" && c.ownerId) return false;
      if (product !== "all" && !c.productIds.includes(product)) return false;
      if (eventF !== "all" && (eventF === "none" ? c.eventId : c.eventId !== eventF)) return false;
      if (teamF !== "all" && (teamF === "none" ? c.teamId : c.teamId !== teamF)) return false;
      if (rating !== "all" && (c.rating || 0) < Number(rating)) return false;
      if (tagF !== "all" && !c.tags.includes(tagF)) return false;
      if (companyF !== "all" && (companyF === "none" ? !!c.companyId : c.companyId !== companyF)) return false;
      return true;
    });
    const by: Record<string, (a: ContactDTO, b: ContactDTO) => number> = {
      az: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      attention: (a, b) => Number(isDue(m, b)) - Number(isDue(m, a)) || Number(isOpen(b)) - Number(isOpen(a)) || daysSince(m, b) - daysSince(m, a),
      recent: (a, b) => b.createdAt - a.createdAt,
      company: (a, b) => coName(m, a).localeCompare(coName(m, b)) || a.name.localeCompare(b.name),
      rating: (a, b) => b.rating - a.rating,
    };
    return l.sort(by[sort] || by.az);
  }, [m, q, stage, owner, product, sort, eventF, teamF, rating, tagF, companyF, kind]);
  const c = sel ? m.contactMap.get(sel) : undefined;
  const [mode, setMode] = useViewMode("contacts");
  const [showF, setShowF] = useState(false);
  const [limit, setLimit] = useState(120);
  const set = (f: Partial<Record<string, string>>) => applyView({ ...DEFAULTS, q, sort, ...f });
  // one-tap quick views (they set the same filters as the Filters panel)
  const QUICK: [string, string, Record<string, string>][] = [["all", "All", {}], ["hot", "Hot (4★+)", { rating: "4" }], ["new", "New", { stage: "new" }], ["meeting", "Meeting set", { stage: "meeting" }],
    ["mine", "Mine", { owner: "mine" }], ...(perms.manage ? [["none", "Unassigned", { owner: "none" }] as [string, string, Record<string, string>]] : []), ["lost", "Not now", { stage: "lost" }]];
  const narrow = (f: Record<string, string>) => ({ ...DEFAULTS, q, sort, ...f });
  const same = (a: Record<string, string>, b: Record<string, string>) => Object.keys(DEFAULTS).every((k) => k === "sort" || k === "q" || (a[k] || "") === (b[k] || ""));
  const activeF = (["stage", "owner", "product", "event", "team", "rating", "tag", "company"] as const).filter((k) => filters[k] !== "all").length;
  const pos = c ? list.findIndex((x) => x.id === c.id) : -1;

  // phones and tablets: leads as chats, a lead as a conversation ("Details" shows the full page below)
  if (mobile && c && sp.get("view") !== "details") return <MobileChat key={c.id} c={c} />;
  const src = sp.get("src") || "";
  if (!c && (src === "google" || src === "phone")) return <div className="dir"><SourceTabs src={src} /><AddressBook source={src} /></div>;
  if (mobile && !c) return <><SourceTabs src="" /><MobileLeads /></>;
  if (c) return <div className="lead-page">
    <div className="lead-nav">
      <Link href="/contacts" className="btn ghost">← All contacts</Link>{mobile && <button type="button" className="btn sm mback-chat" onClick={() => router.push(`/contacts?id=${c.id}`)}>💬 Back to chat</button>}
      {pos >= 0 && <div className="lead-step"><button type="button" className="btn ghost icon" aria-label="Previous lead" disabled={pos <= 0} onClick={() => router.push(`/contacts?id=${list[pos - 1].id}`)}>‹</button>
        <span className="small muted">{pos + 1} of {list.length}</span>
        <button type="button" className="btn ghost icon" aria-label="Next lead" disabled={pos >= list.length - 1} onClick={() => router.push(`/contacts?id=${list[pos + 1].id}`)}>›</button></div>}
    </div>
    {c.personal && <p className="pill personal-pill" style={{ margin: "0 0 8px" }}>🔒 Personal · only you can see this contact</p>}
    <section className="panel detailpanel lead-full"><ContactDetail key={c.id} c={c} initialAction={sp.get("do")} /></section>
  </div>;

  const nPersonal = m.contacts.filter((x) => x.personal).length;
  return <div className="dir"><SourceTabs src="" />
    <div className="seg ct-kind" role="tablist" aria-label="Professional or personal contacts">
      <button role="tab" aria-selected={kind === "work"} onClick={() => setKind("work")}>Professional <span className="seg-n">{m.contacts.length - nPersonal}</span></button>
      <button role="tab" aria-selected={kind === "personal"} onClick={() => setKind("personal")} title="Only you can see these: not your manager, not admins">🔒 Personal <span className="seg-n">{nPersonal}</span></button></div>
    {kind === "personal" && <p className="small muted" style={{ margin: "0 0 8px" }}>🔒 Only you can see your personal contacts: nobody else does, not even admins. They aren't sent to the CRM, and other people's emails and meetings are never added to them.</p>}
    <DirHead count={list.length} noun={list.length === 1 ? "contact" : "contacts"} total={m.contacts.length}>
      <div className="dir-search"><Icon name="search" size={15} /><input type="search" placeholder="Find a contact" aria-label="Find a contact" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}><option value="az">Name A–Z</option><option value="attention">Needs attention first</option><option value="recent">Recently added</option><option value="company">By company</option><option value="rating">Highest rated</option></select>
      <button type="button" className={"btn" + (showF || activeF ? " on" : "")} aria-expanded={showF} onClick={() => setShowF(!showF)}><Icon name="list" size={15} />Filters{activeF ? <span className="fcount">{activeF}</span> : null}</button>
      <ViewToggle value={mode} onChange={setMode} />
      {perms.write && <button type="button" className="btn primary" onClick={() => window.dispatchEvent(new CustomEvent("lt:new", { detail: "contact" }))}>+ Contact</button>}
    </DirHead>
    <div className="quick" role="group" aria-label="Quick views">{QUICK.map(([k, l, f]) => <button key={k} type="button" className="chip" aria-pressed={same(filters, narrow(f))} onClick={() => set(f)}>{l}</button>)}</div>
    {showF && <div className="dir-filters">
      <label>Stage<select aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value)}><option value="all">All stages</option>{STAGES.map((s) => <option key={s[0]} value={s[0]}>{s[1]}</option>)}</select></label>
      <label>Owner<select aria-label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="all">Everyone</option><option value="mine">Mine</option><option value="none">Unassigned</option></select></label>
      <label>Product<select aria-label="Product" value={product} onChange={(e) => setProduct(e.target.value)}><option value="all">All products</option>{m.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Event<select aria-label="Event" value={eventF} onChange={(e) => setEventF(e.target.value)}><option value="all">All events</option><option value="none">No event</option>{m.events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
      {m.teams.length > 0 && <label>Team<select aria-label="Team" value={teamF} onChange={(e) => setTeamF(e.target.value)}><option value="all">All teams</option><option value="none">No team</option>{m.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
      <label>Rating<select aria-label="Rating" value={rating} onChange={(e) => setRating(e.target.value)}><option value="all">Any rating</option><option value="4">4 stars and up (hot)</option><option value="5">5 stars</option><option value="3">3 stars and up</option></select></label>
      <label>Company<SelectAdd kind="company" noNew label="Company" value={companyF === "all" ? "" : companyF} onChange={(v) => setCompanyF(v || "all")}>
        <option value="">All companies</option><option value="none">No company</option>{[...m.companies].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</SelectAdd></label>
      <label>Tag<select aria-label="Tag" value={tagF} onChange={(e) => setTagF(e.target.value)}><option value="all">Any tag</option>{TAGS.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
      {activeF > 0 && <button type="button" className="linkbtn" onClick={() => set({})}>Clear filters</button>}
    </div>}
    <ViewsBar page="contacts" filters={filters} defaults={DEFAULTS} apply={applyView} hideAll />
    <p className="count sr-only">{list.length} contact{list.length === 1 ? "" : "s"}</p>
    <BulkSelect kind="contact" noun={["contact", "contacts"]} ids={list.map((x) => x.id)}>
    {!list.length ? <p className="empty dir-empty">{m.contacts.length ? "No contacts match. Try another quick view or clear the filters." : "No contacts yet. Add one, scan a badge or import a spreadsheet."}</p>
      : mode === "cards" ? <div className="cards">{list.slice(0, limit).map((x) => <ContactCard key={x.id} c={x} />)}</div>
      : <div className="panel tbl-wrap"><table className="tbl dir-tbl"><thead><tr><th>Name</th><th>Company</th><th>Stage</th><th>Rating</th><th>Owner</th><th>Next follow-up</th><th>Last touch</th></tr></thead>
        <tbody>{list.slice(0, limit).map((x) => { const st = STAGES.find((s) => s[0] === x.status)!; return <tr key={x.id} data-sel-id={x.id} onClick={() => router.push(`/contacts?id=${x.id}`)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") router.push(`/contacts?id=${x.id}`); }}>
          <td><span className="tname"><Monogram name={x.name} size={28} ring={heatColor(m, x)} /><span><b>{x.name}</b><small>{x.title}</small></span></span></td><td>{coName(m, x)}</td>
          <td><span className="spill" style={{ ["--sc" as string]: st[2] }}>{st[1]}</span></td><td className="stars-ro">{"★".repeat(x.rating || 0)}<span>{"★".repeat(5 - (x.rating || 0))}</span></td>
          <td>{userName(m, x.ownerId)}</td><td className={x.nextFollowUp && x.nextFollowUp < todayStr() ? "late" : ""}>{x.nextFollowUp || "—"}</td><td>{ago(lastTouch(m, x))}</td></tr>; })}</tbody></table></div>}
    </BulkSelect>
    {list.length > limit && <div className="dir-more"><button type="button" className="btn" onClick={() => setLimit(limit + 120)}>Show {Math.min(120, list.length - limit)} more</button></div>}
  </div>;
}

/** A contact as a card: who, where, how hot, where they are in the funnel, and one-tap email or call. */
function ContactCard({ c }: { c: ContactDTO }) {
  const { m } = useData(); const router = useRouter();
  const st = STAGES.find((s) => s[0] === c.status)!; const prods = prodNames(m, c); const due = c.nextFollowUp && c.nextFollowUp <= todayStr() && !followDismissed(c);
  const open = () => router.push(`/contacts?id=${c.id}`);
  return <article data-sel-id={c.id} className="ccard" role="link" tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.key === "Enter") open(); }} aria-label={c.name} style={{ ["--sc" as string]: st[2] }}>
    <div className="cc-top"><Monogram name={c.name} size={46} ring={heatColor(m, c)} />
      <div className="cc-id"><b>{c.name}</b><span>{c.title || "No title yet"}</span>{coName(m, c) && <span className="cc-co">{coName(m, c)}</span>}</div></div>
    <div className="cc-mid"><span className="spill">{st[1]}</span>{c.rating > 0 && <span className="cc-stars" aria-label={`${c.rating} stars`}>{"★".repeat(c.rating)}</span>}</div>
    {prods.length > 0 && <div className="cc-prods">{prods.slice(0, 3).map((p) => <span key={p}>{p}</span>)}</div>}
    <div className="cc-foot">
      <span title="Last touch">{ago(lastTouch(m, c))}</span>
      {c.nextFollowUp && <span className={due ? "due" : ""} title="Next follow-up">{due ? "Due " : "Next "}{c.nextFollowUp.slice(5)}</span>}
      <span className="cc-owner">{c.ownerId ? userName(m, c.ownerId) : "Unassigned"}</span>
      <span className="cc-act" onClick={(e) => e.stopPropagation()}>
        {c.email && <Link href={`/contacts?id=${c.id}&do=email`} aria-label={`Email ${c.name}`} title={`Email ${c.email}`}><Icon name="mail" size={14} /></Link>}
        {c.phone && <Link href={`/contacts?id=${c.id}&do=call`} aria-label={`Call ${c.name}`} title={`Call ${c.phone}`}><Icon name="phone" size={14} /></Link>}
      </span>
    </div>
  </article>;
}

function ContactDetail({ c, initialAction }: { c: ContactDTO; initialAction: string | null }) {
  const { m, run, perms } = useData();
  const router = useRouter();
  const [voice, setVoice] = useState(false);
  const [prep, setPrep] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("prep") === "1");
  const meetAt = nextMeeting(m.actsByContact.get(c.id) || []);
  const [action, setAction] = useState<ActivityType | null>((initialAction as ActivityType) || null);
  const composeRef = useRef<HTMLDivElement>(null);
  // when a form opens (or switches), bring it into view and put the cursor in its first field.
  // It jumps straight there (a smooth glide can be thrown off while the page is still settling), stays pinned
  // while content loads around it, and glows briefly so the eye lands on it. Scrolling yourself stops the pinning.
  useEffect(() => {
    if (!action) return;
    let moved = false; let ro: ResizeObserver | undefined; const timers: ReturnType<typeof setTimeout>[] = [];
    const mine = () => { moved = true; };
    const events = ["wheel", "touchstart", "keydown"] as const;
    const offset = () => {
      const tb = document.querySelector<HTMLElement>(".topbar"); const dock = document.querySelector<HTMLElement>(".actions.dock");
      const bar = tb && getComputedStyle(tb).position !== "static" ? tb.getBoundingClientRect().height : 0;
      const d = dock && getComputedStyle(dock).position === "sticky" ? dock.getBoundingClientRect().height + 8 : 0;
      return bar + d + 16;
    };
    const place = () => {
      const el = composeRef.current; if (!el || moved) return;
      const off = offset(); const r = el.getBoundingClientRect();
      if (Math.abs(r.top - off) > 8) window.scrollTo({ top: Math.max(0, r.top + window.scrollY - off), behavior: "auto" });
    };
    // phones and tablets: scroll there once and let the person tap to type (the keyboard and the phone's
    // own scrolling would otherwise fight the pinning, which looks like the form is dancing)
    const touch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (touch) {
      timers.push(setTimeout(() => { const el = composeRef.current; if (!el) return; place(); el.classList.remove("arrived"); void el.offsetWidth; el.classList.add("arrived"); }, 40));
      return () => timers.forEach(clearTimeout);
    }
    timers.push(setTimeout(() => {
      const el = composeRef.current; if (!el) return;
      el.querySelector<HTMLElement>("textarea, input[type=text], input:not([type]), select")?.focus({ preventScroll: true });
      place();
      el.classList.remove("arrived"); void el.offsetWidth; el.classList.add("arrived");
      events.forEach((ev) => window.addEventListener(ev, mine, { passive: true }));
      ro = new ResizeObserver(place); ro.observe(document.body);
    }, 40));
    timers.push(setTimeout(place, 350), setTimeout(() => { place(); ro?.disconnect(); events.forEach((ev) => window.removeEventListener(ev, mine)); }, 1600));
    return () => { timers.forEach(clearTimeout); ro?.disconnect(); events.forEach((ev) => window.removeEventListener(ev, mine)); };
  }, [action]);
  const [edit, setEdit] = useState(false); const [bgEdit, setBgEdit] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"won" | "lost" | null>(null);
  const [notes, setNotes] = useState(false); const [discOpen, setDiscOpen] = useState(true);
  const [book, setBook] = useState(false); const [deal, setDeal] = useState(false); const [task, setTask] = useState(false); const [seqPick, setSeqPick] = useState(false);
  const deals = m.deals.filter((d) => d.contactId === c.id || (!d.contactId && d.companyId && d.companyId === c.companyId));
  const tasks = m.tasks.filter((t) => taskLeadIds(t).includes(c.id) && !t.done);
  const enr = m.enrollments.filter((e) => e.contactId === c.id).sort((a, b) => b.enrolledAt - a.enrolledAt);
  const activeEnr = enr.find((e) => e.status === "active");
  const co = c.companyId ? m.companyMap.get(c.companyId) : undefined;
  const w = perms.write;
  const ownerLocked = !perms.manage && !!c.ownerId && c.ownerId !== m.me.id;
  const patch = (json: Record<string, unknown>) => run(() => api(`/api/contacts/${c.id}`, { method: "PATCH", json }));
  const ownerOpts = perms.manage ? m.users.filter((u) => u.status === "active" && u.role !== "viewer") : m.users.filter((u) => u.id === m.me.id || u.id === c.ownerId);
  const acts = m.actsByContact.get(c.id) || [];
  // show one kind at a time if you like (emails, calls, notes...)
  const [kindF, setKindF] = useState<Kind | "all">("all");
  const kindCounts = useMemo(() => { const n: Partial<Record<Kind, number>> = {}; for (const a of acts) { const k = activityKind(a); n[k] = (n[k] || 0) + 1; } return n; }, [acts]);
  const shown = kindF === "all" ? acts : acts.filter((a) => activityKind(a) === kindF);
  const st = m.stats.get(c.id);
  return <>
    <div className="d-head">
      <div className="avatar">{c.name.split(/\s+/).slice(0, 2).map((x) => x[0]).join("").toUpperCase()}</div>
      <div>
        <h2>{c.name} <LinkedInBadge url={c.linkedinUrl} /></h2>
        <div className="muted">{c.title}{c.title && co ? ", " : ""}{co && <Link className="colink" href={`/companies?id=${co.id}`}>{co.name}</Link>}</div>
        {co?.website && <div className="web"><a href={webHref(co.website)} target="_blank" rel="noopener noreferrer">{webLabel(co.website)}</a></div>}
        <div className="contactlinks">
          {c.email ? (w ? <button className="colink" onClick={() => setAction("email")}>{c.email}</button> : <a href={`mailto:${c.email}`}>{c.email}</a>) : <span className="muted">No email</span>}
          {c.phone ? <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} onClick={() => w && setTimeout(() => setAction("call"), 300)}>{fmtPhone(c.phone)}</a> : <span className="muted">No phone</span>}
          {(c.otherEmails || []).map((e) => <a key={e} href={`mailto:${e}`} className="small">{e}</a>)}
          {(c.otherPhones || []).map((p) => <a key={p} href={`tel:${p.replace(/[^\d+]/g, "")}`} className="small">{fmtPhone(p)}</a>)}
        </div>
      </div>
      {w && <div className="hbtns"><button className="btn" onClick={() => setEdit(true)}>Edit</button>
        <LinkedInTools compact who={{ name: c.name, company: co?.name, title: c.title, email: c.email }} onApply={async (f: LiFields) => {
          const patch: Record<string, string> = {}; if (f.linkedinUrl) patch.linkedinUrl = f.linkedinUrl; if (f.background) patch.background = f.background;
          if (f.title && !c.title) patch.title = f.title; if (f.phone && !c.phone) patch.phone = f.phone; if (f.email && !c.email) patch.email = f.email;
          await run(() => api(`/api/contacts/${c.id}`, { method: "PATCH", json: patch }), f.linkedinUrl ? "LinkedIn profile saved" : "Details filled in"); }} /></div>}
    </div>
    {(c.background || bgEdit !== null) && <div className="li-bg"><b className="small">Background</b>{bgEdit !== null
      ? <><textarea rows={4} value={bgEdit} onChange={(e) => setBgEdit(e.target.value)} aria-label="Background" /><div className="btns"><button className="btn sm primary" onClick={async () => { await run(() => api(`/api/contacts/${c.id}`, { method: "PATCH", json: { background: bgEdit } }), "Saved"); setBgEdit(null); }}>Save</button><button className="btn sm ghost" onClick={() => setBgEdit(null)}>Cancel</button></div></>
      : <><p className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}><Linkify text={c.background} /></p>{w && <button className="linkbtn small" onClick={() => setBgEdit(c.background || "")}>Edit</button>}</>}</div>}
    {/* where this lead is on the way to a deal: click a step to move it there */}
    <NextActionCard c={c} onDo={(k) => { if (k === "meeting") { if (m.connection && c.email) setBook(true); else setAction("meeting"); } else if (k === "email") setAction(c.email ? "email" : "call"); else if (k === "task") router.push(`/tasks`); else setAction(k); }} />
    <div className={"stage-track" + (c.status === "lost" ? " lost" : "")} role="group" aria-label="Stage">
      {STAGES.filter((s) => s[0] !== "lost").map((s, i, list) => { const at = list.findIndex((x) => x[0] === c.status); const done = at >= 0 && i < at; const now = s[0] === c.status;
        return <button key={s[0]} type="button" disabled={!w || now} className={"st" + (done ? " done" : "") + (now ? " now" : "")} aria-current={now ? "step" : undefined}
          title={now ? `Current stage: ${s[1]}` : w ? `Move to ${s[1]}` : s[1]} onClick={() => { if (s[0] === "won") setOutcome("won"); else patch({ status: s[0], outcomeReason: null, outcomeNote: "" }); }}>
          <i aria-hidden="true" /><span>{s[1]}</span></button>; })}
      {c.status === "lost" ? <span className="st-lost">Not now{c.outcomeReason ? `: ${c.outcomeReason}` : ""}</span>
        : w && <button type="button" className="st-not" onClick={() => setOutcome("lost")}>Mark not now</button>}
    </div>
    <div className="fields">
      <label>Stage<select disabled={!w} value={c.status} onChange={(e) => { const v = e.target.value; if (v === "won" || v === "lost") setOutcome(v); else patch({ status: v, outcomeReason: null, outcomeNote: "" }); }}>{STAGES.map((s) => <option key={s[0]} value={s[0]}>{s[1]}</option>)}</select></label>
      <label>Owner<select disabled={!w || ownerLocked} value={c.ownerId || ""} onChange={(e) => patch({ ownerId: e.target.value || null })}>
        <option value="">Unassigned</option>{ownerOpts.map((u) => <option key={u.id} value={u.id}>{u.id === m.me.id ? "You" : u.name || u.email}</option>)}
        {c.ownerId && !ownerOpts.some((u) => u.id === c.ownerId) && <option value={c.ownerId}>{userName(m, c.ownerId)}</option>}</select></label>
      <label>Next follow-up<input type="date" disabled={!w} value={c.nextFollowUp || ""} onChange={(e) => patch({ nextFollowUp: e.target.value || null })} /></label>
      <label>Lead rating<span className="stars" role="group" aria-label="Rating">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={c.rating >= n ? "on" : ""} disabled={!w} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => patch({ rating: c.rating === n ? 0 : n })}>★</button>)}</span></label>
    </div>
    <div className="fields" style={{ borderTop: 0, paddingTop: 0, marginTop: 12, gridTemplateColumns: "repeat(5,minmax(0,1fr))" }}>
      <label>Source<select disabled={!w} value={c.source} onChange={(e) => patch({ source: e.target.value })}>{[...new Set([...SOURCES, c.source].filter(Boolean))].map((s) => <option key={s}>{s}</option>)}{!c.source && <option value="">Not set</option>}</select></label>
      <label>Introduced by<input type="text" disabled={!w} defaultValue={c.referredBy} placeholder="Who referred them" onBlur={(e) => e.target.value !== c.referredBy && patch({ referredBy: e.target.value })} /></label>
      <label>Event<select disabled={!w} value={c.eventId || ""} onChange={(e) => patch({ eventId: e.target.value || null })}><option value="">None</option>{m.events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}</select></label>
      <label>Team<SelectAdd kind="team" disabled={!w} value={c.teamId || ""} onChange={(v) => patch({ teamId: v || null })}><option value="">No team</option>{m.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</SelectAdd></label>
      <label>CRM{c.crmId ? <span className="small" style={{ paddingTop: 8 }}>In HubSpot{c.crmSyncedAt ? `, synced ${ago(c.crmSyncedAt)}` : ""}</span> : <span className="small muted" style={{ paddingTop: 8 }}>{m.config.crm ? "Not pushed yet" : "Not connected"}</span>}</label>
    </div>
    {(c.status === "won" || c.status === "lost") && c.outcomeReason && <div className="banner" style={{ margin: "12px 0 0" }}><b>{c.status === "won" ? "Won" : "Not now"}: {c.outcomeReason}</b>{c.outcomeNote ? ` · ${c.outcomeNote}` : ""}</div>}
    <div className="chips" role="group" aria-label="Follow-up tags">{TAGS.map((t) => { const on = c.tags.includes(t); return <button key={t} className="chip" aria-pressed={on} disabled={!w} onClick={() => patch({ tags: on ? c.tags.filter((x) => x !== t) : [...c.tags, t] })}>{t}</button>; })}</div>
    <h3 className="section-h">Products of interest</h3>
    <div className="chips" style={{ marginTop: 0 }}>{m.products.map((p) => { const on = c.productIds.includes(p.id); return <button key={p.id} className="chip" aria-pressed={on} disabled={!w} onClick={() => patch({ productIds: on ? c.productIds.filter((x) => x !== p.id) : [...c.productIds, p.id] })}>{p.name}</button>; })}
      {!m.products.length && <span className="muted small">No products yet.</span>}</div>
    {c.unsubscribedAt && <div className="banner" style={{ margin: "12px 0 0", borderColor: "var(--mild)" }}><b>Unsubscribed from emails</b> on {new Date(c.unsubscribedAt).toLocaleDateString()}. Sequences are stopped and sending from here is blocked. You can still call, log notes and book meetings.
      {w && <> <button className="linkbtn" onClick={() => { if (confirm(`Only do this if ${c.name} asked to receive emails again. It's recorded on the timeline.`)) run(() => api(`/api/contacts/${c.id}/resubscribe`, { json: {} }), "Marked as opted back in"); }}>They asked to hear from us again</button></>}</div>}
    {w ? <div className="actions dock">
      {m.config.transcribe && typeof window !== "undefined" && "MediaRecorder" in window && <button className="btn voice-btn" onClick={() => setVoice(true)} title="Record a quick note; AI writes it up and suggests tasks">🎙 Voice note</button>}
      {c.email && <button className="btn primary" onClick={() => setAction("email")}>Write email</button>}
      {m.connection && c.email && <button className="btn" onClick={() => setBook(true)}>Book meeting</button>}
      {(["call", "reply", "request", "meeting", "note", "file"] as ActivityType[]).map((t) => <button key={t} className="btn" onClick={() => setAction(t)}>{{ call: "Log call", reply: "Log reply", request: "Log request", meeting: "Log meeting", note: "Add note", file: "Attach file" }[t as string]}</button>)}
    </div> : <p className="muted small" style={{ marginTop: 14 }}>You have view-only access.</p>}
    {w && <div className="actions" style={{ marginTop: 8 }}>
      {m.config.ai && <button className={"btn " + (meetAt ? "prep-btn" : "ghost")} onClick={() => setPrep(true)}>📋 Meeting prep{meetAt ? ` · ${new Date(meetAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}` : ""}</button>}
      {c.email && m.config.mail && m.sequences.some((q) => q.active) && !activeEnr && <button className="btn ghost" onClick={() => setSeqPick(!seqPick)}>Add to sequence</button>}
      {m.config.crm && <button className="btn ghost" onClick={() => run(() => api(`/api/contacts/${c.id}/crm`, { json: {} }), "Pushed to HubSpot")}>{c.crmId ? "Update in HubSpot" : "Push to HubSpot"}</button>}
      <button className="btn ghost" onClick={() => setNotes(true)}>✦ AI meeting notes</button>
      <button className="btn ghost" onClick={() => setTask(true)}>Add task</button>
      <button className="btn ghost" onClick={() => setDeal(true)}>Add deal</button>
    </div>}
    {seqPick && <div className="compose"><div className="form"><h3>Add {firstName(c.name)} to a sequence</h3>
      {m.sequences.filter((q) => q.active).map((q) => <button key={q.id} className="btn" style={{ justifyContent: "space-between" }} onClick={async () => { const r = await run(() => api<{ enrolled: number }>("/api/enrollments", { json: { sequenceId: q.id, contactIds: [c.id] } }), "Added to sequence"); if (r) setSeqPick(false); }}>
        <span>{q.name}</span><span className="small muted">{q.steps.length} emails over {q.steps[q.steps.length - 1]?.dayOffset || 0} days</span></button>)}
      <div className="btns"><button className="btn ghost" onClick={() => setSeqPick(false)}>Cancel</button></div></div></div>}
    {activeEnr && <div className="banner" style={{ margin: "12px 0 0" }}>In sequence <b>{m.sequenceMap.get(activeEnr.sequenceId)?.name}</b>, step {activeEnr.step + 1}. {activeEnr.nextAt ? `Next email ${activeEnr.nextAt < Date.now() ? "soon" : new Date(activeEnr.nextAt).toLocaleDateString()}.` : ""} Stops automatically if they reply.
      {w && <button className="linkbtn" style={{ marginLeft: 8 }} onClick={() => run(() => api(`/api/enrollments/${activeEnr.id}`, { method: "DELETE" }), "Sequence stopped")}>Stop</button>}</div>}
    <div style={{ marginTop: 16 }}><AISummary scope="contact" id={c.id} /></div>
    {(deals.length > 0 || tasks.length > 0) && <div className="grid" style={{ marginTop: 16 }}>
      {deals.length > 0 && <div className={tasks.length ? "s6" : "s12"}><h3 className="section-h" style={{ marginTop: 0 }}>Deals</h3><DealList deals={deals} showCompany={false} /></div>}
      {tasks.length > 0 && <div className={deals.length ? "s6" : "s12"}><h3 className="section-h" style={{ marginTop: 0 }}>Open tasks</h3><TaskList tasks={tasks} showLink={false} /></div>}
    </div>}
    <div id="notes" style={{ marginTop: 16 }}><LinkedNotes contactId={c.id} /></div>
    {action && w && <div className="compose scroll-anchor" ref={composeRef}><Compose key={action} type={action} c={c} m={m} onDone={() => setAction(null)} /></div>}
    <details className="disc-wrap" open={discOpen} onToggle={(e) => setDiscOpen((e.target as HTMLDetailsElement).open)}>
      <summary><h3 className="section-h" style={{ display: "inline", margin: 0 }}>Team discussion</h3> <span className="small muted">internal, never sent to {firstName(c.name)}</span></summary>
      {discOpen && <div style={{ marginTop: 10 }}><Discussion type="contact" id={c.id} /></div>}
    </details>
    {notes && <MeetingNotesDialog c={c} onClose={() => setNotes(false)} />}
    {voice && <MeetingNotesDialog c={c} voice onClose={() => setVoice(false)} />}
    {prep && <MeetingPrepDialog c={c} onClose={() => setPrep(false)} />}
    <ul className="timeline">
      <li className="small muted" style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
        {st?.emails || 0} emails{st?.opened ? ` (${st.opened} opened)` : ""} · {st?.replies || 0} replies · {st?.calls || 0} calls · {st?.requests || 0} requests · added {ago(c.createdAt)}{c.source ? " via " + c.source : ""}
      </li>
      {acts.length > 0 && <li className="tl-filter" role="group" aria-label="Show only">
        <button type="button" className="chip" aria-pressed={kindF === "all"} onClick={() => setKindF("all")}>All <span className="n">{acts.length}</span></button>
        {TIMELINE_KINDS.filter((k) => kindCounts[k]).map((k) => <button key={k} type="button" className={"chip kchip k-" + k} style={{ ["--kc" as string]: KINDS[k].color }} aria-pressed={kindF === k} onClick={() => setKindF(kindF === k ? "all" : k)}>
          <Icon name={KINDS[k].icon} size={13} />{KINDS[k].plural} <span className="n">{kindCounts[k]}</span></button>)}
      </li>}
      {acts.length ? shown.map((a) => <TimelineItem key={a.id} a={a} />) : <li className="empty">No activity yet. Log the first email or call above.</li>}
      {acts.length > 0 && !shown.length && <li className="empty">Nothing of this kind yet.</li>}
    </ul>
    {edit && <ContactDialog contact={c} onClose={() => setEdit(false)} />}
    {outcome && <OutcomeDialog kind="lead" outcome={outcome} onClose={() => setOutcome(null)} onSave={(reason, note) => { setOutcome(null); patch({ status: outcome, outcomeReason: reason, outcomeNote: note }); }} />}
    {book && <BookMeetingDialog c={c} onClose={() => setBook(false)} />}
    {deal && <DealDialog contact={c} onClose={() => setDeal(false)} />}
    {task && <TaskDialog contactId={c.id} companyId={c.companyId} onClose={() => setTask(false)} />}
  </>;
}

/** One timeline entry. Used on lead pages and, with the person shown, on company pages. */
export function TimelineItem({ a, showLead = false }: { a: ActivityDTO; showLead?: boolean }) {
  const { m, run, perms, reload } = useData();
  const t = TYPES[a.type];
  const mine = a.byId === m.me.id;
  const label = a.type === "call" ? `Call, ${CALL_OUT[a.outcome || ""] || ""}` : a.type === "request" ? `Requested ${a.kind || ""}`
    : a.type === "meeting" && a.meetingAt ? `Meeting ${new Date(a.meetingAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
    : a.type === "email" ? (a.origin === "sync" ? "Email sent from mailbox" : a.origin === "sequence" ? `Sequence email${a.kind ? ` (${a.kind})` : ""}` : a.delivery === "sent" ? "Email sent from the app" : "Email logged")
    : a.type === "reply" && a.origin === "sync" ? "Reply received (synced)" : t.label;
  const upd = (json: Record<string, unknown>) => run(() => api(`/api/activities/${a.id}`, { method: "PATCH", json }));
  const isMail = (a.type === "email" || a.type === "reply") && (a.origin === "sync" || !!a.emailFrom || !!a.delivery || a.hasHtml);
  const [editing, setEditing] = useState(false); const [full, setFull] = useState(false);
  const canEdit = canEditActivity(a, m.me.id, perms.manage, perms.write);
  const kind = activityKind(a); const K = KINDS[kind];
  const dir = kind === "email-out" ? "↗" : kind === "email-in" ? "↙" : "";
  const ownerName = a.ownerId ? (a.ownerId === m.me.id ? "you" : m.users.find((u) => u.id === a.ownerId)?.name || "a teammate") : "someone";
  // someone else's private email: only that it happened, and whose it is
  if (a.private) return <li className={"ti ti-private k-" + kind} style={{ ["--kc" as string]: K.color }} data-kind={kind}>
    <span className="ic" aria-hidden="true"><Icon name={K.icon} size={16} />{dir && <i className="dir">{dir}</i>}</span>
    <div><div className="top"><span className="kbadge" style={{ ["--kc" as string]: K.color }}>{K.label}</span>
      <b>🔒 {a.type === "reply" ? `Reply received in ${ownerName === "you" ? "your" : `${ownerName}'s`} mailbox` : `Email sent by ${ownerName}`}</b>
      {showLead && <span className="ti-lead">{m.contactMap.get(a.contactId)?.name}</span>}
      <span className="small muted">{new Date(a.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span></div>
      <div className="small muted">Private to {ownerName}.</div></div></li>;
  const ownMail = (a.type === "email" || a.type === "reply") && a.ownerId === m.me.id;
  const canShareOther = !(a.type === "email" || a.type === "reply") && !!perms.write && (a.byId === m.me.id || m.me.role === "admin" || m.me.role === "manager");
  const shareCtl = ownMail ? <span className="share-ctl"><ShareButton entity="email" id={a.id} shared={!!a.shared} sharedWith={a.sharedWith || []} onDone={() => reload()} what="this email" /></span>
    : canShareOther ? <span className="share-ctl"><ShareButton entity="activity" peopleOnly id={a.id} shared={false} sharedWith={a.sharedWith || []} onDone={() => reload()} what={`this ${({ call: "call log", note: "note", meeting: "meeting", file: "file" } as Record<string, string>)[a.type] || "entry"}`} /></span> : null;
  return <li className={"ti k-" + kind} style={{ ["--kc" as string]: K.color }} data-kind={kind}><span className="ic" aria-hidden="true"><Icon name={K.icon} size={16} />{dir && <i className="dir">{dir}</i>}</span><div>
    <div className="top"><span className="kbadge">{K.label}</span>{showLead && m.contactMap.get(a.contactId) && <Link className="ti-lead" href={`/contacts?id=${a.contactId}`} title="Open this contact">{m.contactMap.get(a.contactId)!.name}{m.contactMap.get(a.contactId)!.email ? <span className="muted"> · {m.contactMap.get(a.contactId)!.email}</span> : null}</Link>}{a.cancelled && <span className="pill fu-late">Cancelled</span>}{label.trim() !== K.label && <strong>{label}</strong>}<span className="muted small">{a.byId ? userName(m, a.byId) : a.origin === "intake" ? "Website form" : "Badge import"} · {ago(a.at)}</span>
      {a.type === "email" && a.openedAt && <span className="pill tag-open">Opened {a.openCount > 1 ? `${a.openCount}x` : ""} · {ago(a.openedAt)}</span>}
      {a.type === "email" && a.bounced && <span className="pill" style={{ color: "var(--cold)" }}>Bounced</span>}
      {a.type === "request" && <span className="pill" style={a.done ? {} : { color: "var(--mild)" }}>{a.done ? "Done" : "Open"}</span>}
    </div>
    {editing ? <EditActivity a={a} onDone={() => setEditing(false)} /> : <>
    {a.subject && <div className="subj">{a.subject}</div>}
    {isMail ? <EmailView a={a} /> : <>
    {a.body && <ClampText a={a} onFull={() => setFull(true)} />}
    {a.files.length > 0 && <div className="files">{a.files.map((f) => f.contentType.startsWith("image/")
      ? <a key={f.id} className="thumb" href={`/api/files/${f.id}`} target="_blank" rel="noopener" title={f.name}><img src={`/api/files/${f.id}`} alt={f.name} loading="lazy" /></a>
      : <a key={f.id} className="doc" href={`/api/files/${f.id}`} target="_blank" rel="noopener">⎘ {f.name}</a>)}</div>}
    </>}
    {a.editedAt && <div className="small muted" title={new Date(a.editedAt).toLocaleString()}>Edited {ago(a.editedAt)}{a.editedById && a.editedById !== a.byId ? ` by ${userName(m, a.editedById)}` : ""}</div>}
    </>}
    {full && <FullView a={a} label={label} onClose={() => setFull(false)} />}
    {!editing && shareCtl}
    {!editing && <div className="tools">
      {canEdit && <button className="linkbtn" onClick={() => setEditing(true)}>Edit</button>}
      {isMail && <button className="linkbtn" onClick={() => setFull(true)}>⤢ Full view</button>}
      {perms.write && a.type === "request" && <button className="linkbtn" onClick={() => upd({ done: !a.done })}>{a.done ? "Reopen" : "Mark done"}</button>}
      {perms.write && a.type === "email" && <button className="linkbtn" onClick={() => upd({ bounced: !a.bounced })}>{a.bounced ? "Not bounced" : "Mark bounced"}</button>}
      {perms.write && (mine || perms.manage) && <button className="linkbtn" style={{ color: "var(--muted)" }} onClick={() => { if (confirm("Delete this entry? Attached files are removed too.")) run(() => api(`/api/activities/${a.id}`, { method: "DELETE" }), "Deleted"); }}>Delete</button>}
    </div>}
  </div></li>;
}

/** Put the booking link above the sign-off ("Best regards") if there is one, otherwise at the end. */
function insertLink(text: string, url: string) {
  const line = `You can pick a time that suits you here: ${url}`;
  const m = text.match(/\n\s*(best( regards)?|kind regards|regards|thanks|thank you|cheers|warm regards),?\s*\n/i);
  return m && m.index !== undefined ? `${text.slice(0, m.index).trimEnd()}\n\n${line}\n${text.slice(m.index)}` : `${text.trimEnd()}\n\n${line}`;
}

function Compose({ type, c, m, onDone }: { type: ActivityType; c: ContactDTO; m: Model; onDone: () => void }) {
  const { run, toast } = useData();
  const files = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState("");
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [outcome, setOutcome] = useState("connected");
  const [kind, setKind] = useState(REQ_KINDS[0]);
  const [when, setWhen] = useState("");
  const st = m.stats.get(c.id);
  const byName = (n: string) => m.templates.find((t) => t.name.toLowerCase().includes(n))?.id;
  const defaultTpl = (st?.emails ? byName("second follow") : c.tags.includes("Send product brochure") ? byName("brochure") : c.tags.includes("Send price list") ? byName("price") : c.tags.includes("Schedule meeting") ? byName("meeting") : byName("thanks")) || m.templates[0]?.id || "blank";
  const [tpl, setTpl] = useState(defaultTpl);
  const [manage, setManage] = useState(false);
  const current = m.templates.find((t) => t.id === tpl);
  useEffect(() => { if (type === "email") { setSubject(current ? fillTemplate(current.subject, m, c) : ""); setText(current ? fillTemplate(current.body, m, c) : ""); } }, [tpl]); // eslint-disable-line react-hooks/exhaustive-deps
  const via = m.connection?.canSend ? m.connection.provider : m.config.mail ? "smtp" : null;
  // quick checks before sending; shown once, then "Send anyway" sends as it is
  const [issues, setIssues] = useState<string[] | null>(null);
  const sendNow = (msg: string) => { const found = emailIssues(m, c, subject, text, files.current?.files?.length || 0); if (found.length) { setIssues(found); return; } setIssues(null); submit({ send: true }, msg); };

  async function submit(extra: Record<string, unknown> = {}, okMsg = TYPES[type].label + " logged") {
    setBusy(true);
    const fd = new FormData();
    fd.set("data", JSON.stringify({ contactId: c.id, type, subject, body: text, outcome: type === "call" ? outcome : null, kind: type === "request" ? kind : null,
      meetingAt: type === "meeting" && when ? new Date(when).toISOString() : null, nextFollowUp: next || null, ...extra }));
    for (const f of Array.from(files.current?.files || [])) fd.append("files", f);
    const r = await run(() => api("/api/activities", { form: fd }), okMsg);
    setBusy(false);
    if (r) onDone();
  }
  const fileField = <label>Attach files (optional, up to {m.config.maxUploadMb} MB each)<input ref={files} type="file" multiple /></label>;
  const nextField = <label>Next follow-up (optional)<input type="date" min={todayStr()} value={next} onChange={(e) => setNext(e.target.value)} /></label>;
  const cancel = <button className="btn ghost" type="button" onClick={onDone}>Cancel</button>;
  const mailto = `mailto:${c.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;

  const mailtoTooLong = mailto.length > 1900;
  const openGmail = () => {
    const u = `https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=${encodeURIComponent(c.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    window.open(u, "_blank", "noopener"); submit({ send: false }, "Opened in Gmail and logged on the timeline");
  };
  const openOutlook = () => {
    const u = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(c.email)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    window.open(u, "_blank", "noopener"); submit({ send: false }, "Opened in Outlook and logged on the timeline");
  };
  const openApp = async () => {
    if (mailtoTooLong) { try { await navigator.clipboard.writeText(text); } catch { /* ignore */ } }
    window.location.href = mailtoTooLong ? `mailto:${c.email}?subject=${encodeURIComponent(subject)}` : mailto;
    submit({ send: false }, mailtoTooLong ? "Message copied: paste it into the email that opened. Logged." : "Opened in your mail app and logged");
  };
  const usesGoogle = m.connection?.provider === "google" || (!m.connection && m.config.mailboxProviders.includes("google"));
  const usesMicrosoft = m.connection?.provider === "microsoft" || (!m.connection && !usesGoogle && m.config.mailboxProviders.includes("microsoft"));

  if (type === "email") return <div className="form">
    <h3>Email to {c.email}</h3>
    <div className="compose-row">
      <label className="grow">Template<select value={tpl} onChange={(e) => setTpl(e.target.value)}>{m.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}<option value="blank">Blank</option></select></label>
      <button type="button" className="btn ghost" onClick={() => setManage(true)}>Manage templates</button>
    </div>
    <label>Subject<input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
    {m.config.ai && <AiWriter contactId={c.id} subject={subject} body={text} intent={current?.name || "Follow-up"} onDraft={(s2, b2) => { if (s2) setSubject(s2); setText(b2); }} />}
    <label>Message<AiText kind="email" rows={10} value={text} onChange={(e) => setText(e.target.value)} /></label>
    {type === "email" && <InsertContentLink contactId={c.id} onInsert={(x) => setText(insertLink(text, x))} />}
    {m.booking?.enabled ? <button type="button" className="btn ghost" style={{ justifySelf: "start" }} disabled={text.includes(m.booking.url)} onClick={() => setText(insertLink(text, m.booking!.url))}>📅 Insert my booking link</button>
      : <p className="small muted" style={{ margin: 0 }}>Tip: set up your booking page on the Account page so leads can pick a time themselves.</p>}
    {fileField}{nextField}
    <p className="muted small" style={{ margin: 0 }}>{via === "google" || via === "microsoft" ? `"Send now" sends from your own ${via === "google" ? "Gmail" : "Outlook"} (${m.connection!.email}), so it's in your Sent folder and replies come back to your inbox${m.config.openTracking ? ". Opens are tracked" : ""}.`
      : via === "smtp" ? `"Send now" emails ${firstName(c.name)} from the shared company mailbox, with replies going to ${m.me.email}. Connect your Google account on the Account page to send from your own Gmail instead.`
      : "To send from here, connect your Google account on the Account page. Until then, open it in Gmail or your mail app; it's logged here either way."}</p>
    {issues && <div className="precheck" role="alert"><b>Before you send</b><ul>{issues.map((x, i) => <li key={i}>{x}</li>)}</ul>
      <div className="inline" style={{ gap: 8 }}><button type="button" className="btn" onClick={() => setIssues(null)}>Go back and fix</button>
        <button type="button" className="btn primary" disabled={busy} onClick={() => { const msg = via === "google" ? "Sent from your Gmail" : via === "microsoft" ? "Sent from your Outlook" : "Sent"; setIssues(null); submit({ send: true }, msg); }}>Send anyway</button></div></div>}
    <div className="btns">
      {c.unsubscribedAt && <span className="small" style={{ color: "var(--mild)" }}>{c.name} unsubscribed, so sending is blocked.</span>}
      {via && !c.unsubscribedAt && <button className="btn primary" disabled={busy || !subject.trim()} onClick={() => sendNow(via === "google" ? "Sent from your Gmail" : via === "microsoft" ? "Sent from your Outlook" : "Email sent")}>{busy ? "Sending…" : "Send now"}</button>}
      {usesGoogle && <button type="button" className={"btn" + (via ? "" : " primary")} disabled={busy} onClick={openGmail} title="Opens a Gmail draft in a new tab with this email filled in, and logs it here">Open in Gmail and log</button>}
      {usesMicrosoft && <button type="button" className={"btn" + (via ? "" : " primary")} disabled={busy} onClick={openOutlook}>Open in Outlook and log</button>}
      <button type="button" className="btn" disabled={busy} onClick={openApp} title="Opens your computer's mail app (Apple Mail, Outlook desktop)">Open in mail app and log</button>
      <button className="btn" type="button" onClick={async () => { try { await navigator.clipboard.writeText(subject + "\n\n" + text); toast("Copied"); } catch { toast("Copy failed.", "error"); } }}>Copy</button>
      <button className="btn" disabled={busy} onClick={() => submit({ send: false })}>Log as sent</button>{cancel}
    </div>
    {manage && <TemplatesDialog onClose={() => setManage(false)} />}
  </div>;
  if (type === "call") return <div className="form"><h3>Log a call{c.phone ? " with " + fmtPhone(c.phone) : ""}</h3>
    <div className="radios" role="radiogroup" aria-label="Outcome">{Object.entries(CALL_OUT).map(([k, l]) => <label key={k}><input type="radio" name="outcome" checked={outcome === k} onChange={() => setOutcome(k)} />{l}</label>)}</div>
    <label>Notes<AiText kind="note" rows={4} placeholder="What was discussed?" value={text} onChange={(e) => setText(e.target.value)} /></label>{nextField}
    <div className="btns"><button className="btn primary" disabled={busy} onClick={() => submit()}>Save call</button>{cancel}</div></div>;
  if (type === "reply") return <div className="form"><h3>Log a reply from {firstName(c.name)}</h3>
    <label>Reply<AiText kind="note" rows={5} placeholder="Paste their reply or summarise it" value={text} onChange={(e) => setText(e.target.value)} /></label>{fileField}{nextField}
    <div className="btns"><button className="btn primary" disabled={busy} onClick={() => submit()}>Save reply</button>{cancel}</div></div>;
  if (type === "request") return <div className="form"><h3>Log a request</h3>
    <label>They asked for<select value={kind} onChange={(e) => setKind(e.target.value)}>{REQ_KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
    <label>Details<AiText kind="note" rows={3} value={text} onChange={(e) => setText(e.target.value)} /></label>{fileField}{nextField}
    <div className="btns"><button className="btn primary" disabled={busy} onClick={() => submit()}>Save request</button>{cancel}</div></div>;
  if (type === "meeting") return <div className="form"><h3>Log a meeting</h3>
    <label>When<input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
    <label>Notes<AiText kind="note" rows={3} placeholder="Agenda, attendees, outcome" value={text} onChange={(e) => setText(e.target.value)} /></label>{fileField}{nextField}
    <div className="btns"><button className="btn primary" disabled={busy} onClick={() => submit()}>Save meeting</button>{cancel}</div></div>;
  if (type === "note") return <div className="form"><h3>Add a note</h3>
    <label>Note<AiText kind="note" rows={4} placeholder="Anything worth remembering about this contact" value={text} onChange={(e) => setText(e.target.value)} /></label>{fileField}{nextField}
    <div className="btns"><button className="btn primary" disabled={busy} onClick={() => submit()}>Save note</button>{cancel}</div></div>;
  return <div className="form"><h3>Attach files</h3>{fileField}
    <label>Caption<input type="text" placeholder="What is this? (optional)" value={text} onChange={(e) => setText(e.target.value)} /></label>
    <div className="btns"><button className="btn primary" disabled={busy} onClick={() => submit({}, "Uploaded")}>Upload</button>{cancel}</div></div>;
}

