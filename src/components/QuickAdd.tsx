"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DictationMicBase, useRecorder } from "./Voice";
import { decodePhoto, hasDetails, parseQr } from "./qr";
import { QrScanner } from "./QrScanner";
import { flushQueue, listQueue, newId, putItem, removeItem, type QueueItem } from "@/lib/offlineQueue";

type Cache = { me: { name: string | null; email: string }; products: { id: string; name: string }[]; events: { id: string; name: string; startDate: string | null }[]; companies?: string[]; ai: boolean; voice?: boolean; canEvents?: boolean; savedAt: number };
type Scanned = { name: string; title: string; company: string; email: string; phone: string };
const TAGS = ["Immediate follow-up", "Schedule meeting", "Send price list", "Send product brochure"];
const blank = { name: "", title: "", company: "", email: "", phone: "", notes: "", productIds: [] as string[], tags: [] as string[], rating: 0 };

/** Lead capture at the booth: big buttons, works with no signal, sends everything when the phone is back online. */
export function QuickAdd() {
  const [cache, setCache] = useState<Cache | null>(null);
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [f, setF] = useState(blank);
  const [eventId, setEventId] = useState("");
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const vrec = useRecorder(); const [heard, setHeard] = useState("");
  const formVer = useRef(0);   // goes up each time a lead is saved, so a late AI result never fills the next lead
  const [aiBusy, setAiBusy] = useState(false);
  const [newEv, setNewEv] = useState<{ name: string; startDate: string; endDate: string; location: string } | null>(null);
  const [syncing, setSyncing] = useState(false); const [signedOut, setSignedOut] = useState(false);
  const cam = useRef<HTMLInputElement>(null); const gal = useRef<HTMLInputElement>(null);
  // the photo stays with the form: read into the fields, checked by you, saved with the lead
  const [shots, setShots] = useState<Blob[]>([]); const [thumbs, setThumbs] = useState<string[]>([]);
  const [reading, setReading] = useState(false); const [more, setMore] = useState<Scanned[]>([]); const [readMsg, setReadMsg] = useState("");
  const fill = (p: Scanned) => setF((x) => ({ ...x, name: p.name || x.name, title: p.title || x.title, company: p.company || x.company, email: p.email || x.email, phone: p.phone || x.phone }));
  // fill only what's still empty (the QR code's exact details win over what AI reads from the printed text)
  const fillEmpty = (p: Partial<Scanned>) => setF((x) => ({ ...x, name: x.name || p.name || "", title: x.title || p.title || "", company: x.company || p.company || "", email: x.email || p.email || "", phone: x.phone || p.phone || "" }));
  const [scanning, setScanning] = useState(false);
  const clearShots = () => { thumbs.forEach((u) => URL.revokeObjectURL(u)); setShots([]); setThumbs([]); setMore([]); setReadMsg(""); };
  const flash = (t: string, ok = true) => { setMsg({ t, ok }); setTimeout(() => setMsg(null), 3500); };
  const refresh = useCallback(async () => setQueue(await listQueue()), []);

  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      const c: Cache | null = JSON.parse(localStorage.getItem("lt-quick-cache") || "null");
      const r = await flushQueue({ ai: !!c?.ai });
      if (r.signedOut) setSignedOut(true);
      if (r.sent) flash(`${r.sent} sent`);
    } finally { setSyncing(false); refresh(); }
  }, [refresh]);

  useEffect(() => {
    try { setCache(JSON.parse(localStorage.getItem("lt-quick-cache") || "null")); } catch { /* none yet */ }
    setEventId(localStorage.getItem("lt-quick-event") || "");
    setOnline(navigator.onLine);
    const on = () => { setOnline(true); sync(); }, off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    // refresh the product and event lists while online
    if (navigator.onLine) fetch("/api/bootstrap", { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).then((b) => {
      if (!b) return;
      const c: Cache = { me: { name: b.me.name, email: b.me.email }, products: b.products.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })), events: b.events.map((e: { id: string; name: string; startDate: string | null }) => ({ id: e.id, name: e.name, startDate: e.startDate })), companies: b.companies.map((c: { name: string }) => c.name), ai: !!b.config.ai, voice: !!b.config.transcribe, canEvents: ["manager", "admin"].includes(b.me.role), savedAt: Date.now() };
      localStorage.setItem("lt-quick-cache", JSON.stringify(c)); setCache(c);
    }).catch(() => undefined);
    refresh().then(sync);
    const t = setInterval(sync, 30000);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); clearInterval(t); };
  }, [refresh, sync]);

  const pickEvent = (id: string) => { setEventId(id); localStorage.setItem("lt-quick-event", id); };
  /** Voice note: AI fills the empty fields (never what you scanned) and adds a note with what they need and the next step. */
  const voiceNote = async () => {
    if (vrec.state === "idle") { if (!navigator.onLine) { flash("Voice notes need an internet connection. Type or scan instead.", false); return; } try { await vrec.start(); } catch { flash("Allow the microphone to record a voice note.", false); } return; }
    if (vrec.state !== "rec") return; const b = await vrec.stop(); vrec.setState("idle"); const heard = vrec.lastLive.current; const ver = formVer.current;
    // no waiting: what you said goes into the notes now; AI fills in the details in the background
    const quick = heard ? `Voice note: "${heard}"` : "";
    if (quick) setF((x) => ({ ...x, notes: [x.notes.trim(), quick].filter(Boolean).join("\n") }));
    if (!b) return; setAiBusy(true); flash(heard ? "Got it. ✨ Filling in the details in the background…" : "Recorded. ✨ Transcribing in the background…");
    try { const fd = new FormData(); fd.append("audio", new File([b], `note.${b.type.includes("mp4") ? "m4a" : "webm"}`, { type: b.type }));
      const r = await fetch("/api/ai/voice-lead", { method: "POST", body: fd, credentials: "same-origin" }); const j = await r.json(); if (!r.ok) throw new Error(j.error || "Couldn't read that voice note.");
      if (formVer.current !== ver) return;   // that lead was already saved
      const v = j.fields as { name?: string; title?: string; company?: string; email?: string; phone?: string; productIds?: string[]; rating?: number; followUp?: string | null; notes?: string };
      const due = v.followUp ? `Follow up: ${new Date(`${v.followUp}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}` : "";
      const full = [v.notes || "", due, `Voice note: "${j.transcript}"`].filter(Boolean).join("\n");
      setF((x) => ({ ...x, name: x.name || v.name || "", title: x.title || v.title || "", company: x.company || v.company || "", email: x.email || v.email || "", phone: x.phone || v.phone || "",
        productIds: [...new Set([...x.productIds, ...(v.productIds || [])])], rating: x.rating || v.rating || 0,
        notes: quick && x.notes.includes(quick) ? x.notes.replace(quick, full) : [x.notes.trim(), full].filter(Boolean).join("\n") }));
      setHeard(j.transcript); flash("✨ Filled in from your voice note. Check it, then save.");
    } catch (e) { if (formVer.current === ver) flash(e instanceof Error ? e.message : "Couldn't read that voice note.", false); }
    finally { setAiBusy(false); }
  };
  const addEvent = async () => { if (!newEv?.name.trim()) return; if (!navigator.onLine) { flash("Adding an event needs an internet connection.", false); return; }
    const r = await fetch("/api/events", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: newEv.name.trim(), ...(newEv.startDate ? { startDate: newEv.startDate } : {}), ...(newEv.endDate || newEv.startDate ? { endDate: newEv.endDate || newEv.startDate } : {}), location: newEv.location }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) { flash(j.error || "Couldn't add the event.", false); return; }
    const ev = { id: j.id, name: j.name, startDate: j.startDate ?? null };
    setCache((c) => { const n = c ? { ...c, events: [ev, ...c.events] } : c; if (n) localStorage.setItem("lt-quick-cache", JSON.stringify(n)); return n; }); pickEvent(ev.id); setNewEv(null); flash(`Event "${ev.name}" added and selected.`); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!f.name.trim()) return;
    formVer.current++;   // anything AI is still working on belongs to this lead, not the next one
    await putItem({ id: newId(), kind: "lead", createdAt: Date.now(), status: "waiting", note: f.notes, photos: shots.length ? shots : undefined,
      lead: { name: f.name.trim(), title: f.title, company: f.company.trim(), email: f.email.trim(), phone: f.phone, productIds: f.productIds, eventId: eventId || null, rating: f.rating, tags: f.tags } });
    // several people on one photo: the next one fills the form, same photo attached
    if (more.length) { const [next, ...rest] = more; setF({ ...blank, productIds: f.productIds }); fill(next); setMore(rest); setReadMsg(`Next person from the same photo. ${rest.length ? `${rest.length} more after this.` : "Last one."} Check and save.`); }
    else { setF(blank); clearShots(); }
    await refresh();
    flash(navigator.onLine ? `${f.name.trim()} saved` : `${f.name.trim()} saved on this phone. It'll be sent when you're back online.`);
    sync();
  };
  /** Photo taken (or QR scanned): read it into the form. Nothing is saved until you press Save lead. */
  const photos = async (files: FileList | Blob[] | null, qrText?: string) => {
    if (!files?.length && !qrText) return;
    const list = files ? Array.from(files) : [];
    setShots(list); setThumbs((old) => { old.forEach((u) => URL.revokeObjectURL(u)); return list.map((b) => URL.createObjectURL(b)); });
    setMore([]); setReadMsg(""); setReading(true);
    // 1. the QR code, read on the phone (works with no signal)
    let code = qrText || null;
    if (!code) for (const b of list) { code = await decodePhoto(b).catch(() => null); if (code) break; }
    let qrNote = ""; let qrFilled = false;
    if (code) {
      const q = parseQr(code);
      if (hasDetails(q)) { fill(q); qrFilled = true; if (q.website) qrNote = `Website from badge: ${q.website}`; }
      else qrNote = q.kind === "link" ? `Badge QR link: ${q.raw}` : `Badge QR code: ${q.raw.slice(0, 300)}`;
      if (qrNote) setF((x) => ({ ...x, notes: x.notes.includes(qrNote) ? x.notes : [x.notes.trim(), qrNote].filter(Boolean).join("\n") }));
    }
    const qrMsg = !code ? "" : qrFilled ? "Read from the QR code." : "The QR code is an event badge ID that only the organiser's lead retrieval service can decode; it's kept in the notes so you can match it with their lead export later.";
    setReading(false);
    if (!list.length) { setReadMsg(`${qrMsg} Check the details, add anything missing, then Save lead.`.trim()); return; }
    if (!cache?.ai) { setReadMsg(`${qrMsg} ${qrFilled ? "Check the details, then Save lead." : "Photo attached. Type the details below, then Save lead."}`.trim()); return; }
    if (!navigator.onLine) { setReadMsg(`${qrMsg} ${qrFilled ? "You're offline, so the printed text can't be read yet; check the details and Save lead." : "You're offline, so the photo can't be read yet. Type the details below, or keep the photo to read automatically when you're back online."}`.trim()); return; }
    setReading(true);
    try {
      const fd = new FormData(); list.forEach((p, i) => fd.append("images", new File([p], `badge-${i + 1}.jpg`, { type: p.type || "image/jpeg" })));
      const r = await fetch("/api/ai/scan", { method: "POST", body: fd, credentials: "same-origin" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't read the photo.");
      const people: Scanned[] = j.leads || [];
      if (!people.length) setReadMsg(qrFilled ? `${qrMsg} Check the details, then Save lead.` : `${qrMsg} No name or contact details could be read from the printed text. Type them below, or try a clearer photo.`.trim());
      else if (qrFilled) { fillEmpty(people[0]); setReadMsg("Filled in from the QR code and the printed badge. Check the details, then Save lead."); }
      else { fill(people[0]); setMore(people.slice(1)); setReadMsg(`${qrMsg} ${people.length > 1 ? `Found ${people.length} people. The first is filled in below: check it and Save lead, then the next one comes up.` : "Filled in from the photo. Check the details, add anything missing, then Save lead."}`.trim()); }
    } catch (e) { setReadMsg(`${qrMsg} ${(e as Error).message} ${qrFilled ? "Check the details, then Save lead." : "Type the details below instead."}`.trim()); }
    finally { setReading(false); }
  };
  /** Offline: keep the photo to read later, the way it used to work. */
  const keepForLater = async () => {
    await putItem({ id: newId(), kind: "photo", createdAt: Date.now(), status: "waiting", photos: shots, eventId: eventId || null });
    clearShots(); await refresh(); flash("Photo kept on this phone. It'll be read and added when you're back online.");
  };
  const toggle = (l: string[], v: string) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);
  const waiting = queue.filter((q) => q.status === "waiting"), failed = queue.filter((q) => q.status === "error");

  return <main className="qa">
    <header className="qa-h">
      <img src="/icons/icon-192.png" alt="" width={34} height={34} />
      <div><b>Quick add</b><div className={"qa-net" + (online ? "" : " off")}>{online ? "● Online" : "● Offline: saving on this phone"}</div></div>
      <a href="/home" className="qa-link">Open app</a>
    </header>
    {signedOut && <div className="qa-banner err">You've been signed out. <a href="/login">Sign in</a>, then come back here; nothing waiting is lost.</div>}
    {!cache && <div className="qa-banner">Open this page once while online so your products and events are available offline.</div>}

    <label className="qa-l">Event
      <select value={eventId} onChange={(e) => { if (e.target.value === "__new") { if (!cache?.canEvents) { flash("Only managers and admins can add events. Ask one to add it, then it appears here.", false); return; } setNewEv({ name: "", startDate: new Date().toLocaleDateString("en-CA"), endDate: "", location: "" }); return; } pickEvent(e.target.value); }}>
        <option value="">No event</option>{(cache?.events || []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}<option value="__new">{cache?.canEvents === false ? "+ New event (ask a manager)" : "+ New event…"}</option></select></label>
    {newEv && <div className="qa-newev"><b>New event</b>
      <input placeholder="Event name, e.g. Spring Expo 2026" value={newEv.name} onChange={(e) => setNewEv({ ...newEv, name: e.target.value })} aria-label="Event name" autoFocus />
      <div className="qa-two"><label>Starts<input type="date" value={newEv.startDate} onChange={(e) => setNewEv({ ...newEv, startDate: e.target.value })} /></label><label>Ends<input type="date" value={newEv.endDate} onChange={(e) => setNewEv({ ...newEv, endDate: e.target.value })} /></label></div>
      <input placeholder="Location (optional)" value={newEv.location} onChange={(e) => setNewEv({ ...newEv, location: e.target.value })} aria-label="Location" />
      <div className="qa-two"><button type="button" className="qa-save" disabled={!newEv.name.trim()} onClick={addEvent}>Add event</button><button type="button" className="qa-scan" onClick={() => setNewEv(null)}>Cancel</button></div></div>}

    <div className="qa-scan-row">
      <button type="button" className="qa-scan" onClick={() => cam.current?.click()}>📷 Photograph a badge or card</button>
      <button type="button" className="qa-scan qa-gal" onClick={() => gal.current?.click()}>🖼 From gallery</button>
      <button type="button" className="qa-scan qa-qr" onClick={() => setScanning(true)} aria-label="Scan a QR code with the camera">▦ Scan QR</button>
      {cache?.voice !== false && <button type="button" className={"qa-voice" + (vrec.state === "rec" ? " rec" : "")} onClick={voiceNote} disabled={vrec.state === "busy"} aria-label="Voice note: AI fills in the lead">
        {vrec.state === "rec" ? `■ Stop (${vrec.secs}s)` : vrec.state === "starting" ? (vrec.slow ? "Allow the mic ↑" : "Starting…") : aiBusy ? "🎙 Voice note · ✨ filling in…" : "🎙 Voice note"}</button>}
      {vrec.state === "rec" && <div className="qa-live" aria-live="polite">{vrec.live || (vrec.liveOk ? "Listening…" : "Recording… the form fills in when you stop.")}</div>}
    </div>
    {scanning && <QrScanner onClose={() => setScanning(false)} onResult={(text, still) => { setScanning(false); photos(still ? [still] : null, text); }} />}
    <input ref={cam} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { photos(e.target.files); e.target.value = ""; }} />
    <input ref={gal} type="file" accept="image/*" multiple hidden onChange={(e) => { photos(e.target.files); e.target.value = ""; }} aria-label="Choose badge or card photos from your gallery" />
    <p className="qa-hint">{cache?.ai ? "The QR code (if the badge has one) and the printed name, company, email and phone are read into the form below. Nothing is saved until you check it and press Save lead." : "The photo is attached to the lead you fill in below."}</p>
    {(thumbs.length > 0 || reading) && <div className="qa-shot">
      <div className="qa-thumbs">{thumbs.map((u, i) => <img key={i} src={u} alt={`Badge photo ${i + 1}`} />)}</div>
      <div className="qa-shot-txt">{reading ? <b>Reading the photo…</b> : readMsg}
        <div className="qa-shot-act">{!reading && <button type="button" onClick={clearShots}>Remove photo</button>}
          {!reading && !online && cache?.ai && <button type="button" onClick={keepForLater}>Keep photo, read later</button>}</div></div>
    </div>}

    <div className="qa-or"><span>or type it in</span></div>
    <form onSubmit={save} className="qa-form">
      <input required placeholder="Name *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="off" aria-label="Name" />
      <input placeholder="Company (optional)" list="qa-companies" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} aria-label="Company" autoComplete="off" />
      <datalist id="qa-companies">{(cache?.companies || []).slice(0, 500).map((n) => <option key={n} value={n} />)}</datalist>
      {f.company.trim() && cache?.companies && <p className="qa-co">{cache.companies.some((n) => n.toLowerCase() === f.company.trim().toLowerCase()) ? "✓ Existing company" : `New company "${f.company.trim()}" will be added`}</p>}
      <input placeholder="Job title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-label="Job title" />
      <input type="email" inputMode="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} aria-label="Email" />
      <input type="tel" inputMode="tel" placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} aria-label="Phone" />
      {(cache?.products.length || 0) > 0 && <div className="qa-chips" aria-label="Products">{cache!.products.map((p) => <button type="button" key={p.id} aria-pressed={f.productIds.includes(p.id)} onClick={() => setF({ ...f, productIds: toggle(f.productIds, p.id) })}>{p.name}</button>)}</div>}
      <div className="qa-chips" aria-label="Follow-up">{TAGS.map((t) => <button type="button" key={t} aria-pressed={f.tags.includes(t)} onClick={() => setF({ ...f, tags: toggle(f.tags, t) })}>{t}</button>)}</div>
      <div className="qa-stars" role="radiogroup" aria-label="How hot is this lead">{[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} aria-pressed={f.rating >= n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setF({ ...f, rating: f.rating === n ? 0 : n })}>★</button>)}</div>
      <textarea rows={3} placeholder="Notes: what they need, next step" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} aria-label="Notes" />
      <button className="qa-save" disabled={!f.name.trim() || reading}>{shots.length ? "Save lead with photo" : "Save lead"}</button>
    </form>

    {(waiting.length > 0 || failed.length > 0) && <section className="qa-q">
      <div className="qa-qh"><b>{waiting.length} waiting to send</b>{online && <button type="button" onClick={sync} disabled={syncing}>{syncing ? "Sending…" : "Send now"}</button>}</div>
      <ul>{queue.map((q) => <li key={q.id} className={q.status}>
        <span>{q.kind === "photo" ? `📷 Badge photo${(q.photos?.length || 0) > 1 ? `s (${q.photos!.length})` : ""}` : q.lead?.name}</span>
        <span className="qa-s">{q.status === "error" ? <>{q.error} <button type="button" onClick={async () => { await removeItem(q.id); refresh(); }}>Remove</button></> : online ? "sending…" : "waiting for signal"}</span>
      </li>)}</ul>
    </section>}
    {msg && <div className={"qa-toast" + (msg.ok ? "" : " err")} role="status">{msg.t}</div>}
  <DictationMicBase enabled={cache?.voice !== false && online} toast={(t) => flash(t, false)} /></main>;
}
