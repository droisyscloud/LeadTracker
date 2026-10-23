"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { api, useData } from "./data";
import { transcribeBlob, useRecorder } from "./Voice";
import { Linkify } from "./Linkify";
import { AiText } from "./AiText";
import { ShareButton } from "./Share";
import { LinkPicker } from "./LinkPicker";
import { BulkSelect } from "./BulkSelect";
import { PickImages } from "./PickImages";
import { AiFold, FoldBtn } from "./AiFold";

/* Notes (stored as "stories"): capture an event (people photos, business cards, voice notes, notes); AI finds people, you decide what to add. */
type Found = { name: string; title: string; company: string; email: string; phone: string; website: string; from: string; status: "new" | "added" | "company" | "dismissed"; contactId?: string; companyId?: string };
type Item = { id: string; kind: "photo" | "card" | "voice" | "note"; text: string; found: Found[]; aiStatus: string; url: string | null; createdAt: number; editedAt: number | null };
type Story = { draft?: boolean; reading: number; id: string; title: string; eventId: string | null; shared: boolean; mine: boolean; createdAt: number; updatedAt: number; photos: number; cards: number; voice: number; notes: number; pending: number; thumbs: string[] };
type Full = { people?: Person[]; draft?: boolean; contactIds?: string[]; companyIds?: string[]; sharedWith?: string[]; id: string; title: string; eventId: string | null; shared: boolean; mine: boolean; createdAt: number; summary: { summary: string; keyPoints: string[]; nextSteps: string[]; dues?: string[]; dismissed?: string[]; tasks?: Record<string, string>; at: number } | null; items: Item[] };
const fetcher = (u: string) => fetch(u).then((r) => r.json());
const KEY = "lt-story";
/** Phone photos are big: shrink to a size that still reads a card clearly, so uploads are quick on event Wi-Fi. */
async function shrink(f: File): Promise<File> {
  if (!f.type.startsWith("image/") || f.size < 600_000) return f;
  try { const bmp = await createImageBitmap(f); const s = Math.min(1, 1800 / Math.max(bmp.width, bmp.height)); const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height); const b: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85)); return b ? new File([b], f.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : f; }
  catch { return f; }
}
const today = () => new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
async function addItem(storyId: string, kind: Item["kind"], file?: File | Blob, text?: string, edited = false) {
  const fd = new FormData(); fd.append("kind", kind); if (text) fd.append("text", text); if (edited) fd.append("edited", "1");
  if (file) fd.append("file", file instanceof File ? file : new File([file], `voice.${file.type.includes("mp4") ? "m4a" : "webm"}`, { type: file.type }));
  return api<Item>(`/api/stories/${storyId}/items`, { form: fd });
}
/** The capture buttons: Photo and Card open the camera on a phone; Voice records with live words; Note is typed (or dictated). */
function CaptureButtons({ storyId, onAdded }: { storyId: () => Promise<string>; onAdded: (it: Item, sid: string) => void }) {
  const { toast } = useData(); const photo = useRef<HTMLInputElement>(null); const card = useRef<HTMLInputElement>(null); const r = useRecorder();
  const [busy, setBusy] = useState(""); const [note, setNote] = useState<string | null>(null);
  const send = async (kind: Item["kind"], files?: File[] | null, text?: string, blob?: Blob) => {
    setBusy(kind); try { const sid = await storyId();
      if (files) for (const f of files) onAdded(await addItem(sid, kind, await shrink(f)), sid); else onAdded(await addItem(sid, kind, blob, text), sid); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't save that.", "error"); } setBusy(""); };
  const voice = async () => { if (r.state === "idle") { try { await r.start(); } catch { toast("Allow the microphone to record.", "error"); } return; }
    if (r.state !== "rec") return; const b = await r.stop(); r.setState("idle"); if (b) await send("voice", null, r.lastLive.current, b); };
  return <div className="cap">
    <div className="cap-btns">
      <PickImages icon="📸" label="Photo" busyLabel={busy === "photo" ? "Saving…" : undefined} disabled={!!busy} onFiles={(fs) => send("photo", fs)} />
      <PickImages icon="🪪" label="Card" busyLabel={busy === "card" ? "Reading…" : undefined} disabled={!!busy} onFiles={(fs) => send("card", fs)} />
      <button type="button" className={"cap-b" + (r.state === "rec" ? " rec" : "")} disabled={!!busy && busy !== "voice"} onClick={voice}><span>🎙</span>{r.state === "rec" ? `Stop ${r.secs}s` : r.state === "starting" ? (r.slow ? "Allow the mic ↑" : "Starting…") : busy === "voice" ? "Saving…" : "Voice"}</button>
      <button type="button" className="cap-b" disabled={!!busy} onClick={() => setNote(note === null ? "" : null)}><span>✏️</span>Note</button></div>
    {r.state === "rec" && <div className="rec-live" aria-live="polite">● {r.secs}s · {r.live || "Listening… start speaking"}</div>}
    {note !== null && <div className="cap-note"><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened, who you met, what to follow up…" autoFocus aria-label="Note" />
      <div className="btns"><button type="button" className="btn sm primary" disabled={!note.trim() || !!busy} onClick={async () => { await send("note", null, note); setNote(null); }}>Save note</button><button type="button" className="btn sm ghost" onClick={() => setNote(null)}>Cancel</button></div></div>}
  </div>;
}
/** On Home: one button, "Add note". */
export function CaptureBar() {
  const { perms } = useData(); const { data, mutate } = useSWR<{ stories: Story[] }>(perms.write ? "/api/stories" : null, fetcher, { refreshInterval: (d) => (d?.stories.some((x) => x.reading) ? 4000 : 0) });
  const [open, setOpen] = useState(false); useEffect(() => { const h = () => mutate(); window.addEventListener("lt:notes-changed", h); return () => window.removeEventListener("lt:notes-changed", h); }, [mutate]);
  if (!perms.write) return null;
  const pending = (data?.stories || []).reduce((n, x) => n + (x.mine ? x.pending : 0), 0); const reading = (data?.stories || []).some((x) => x.mine && x.reading);
  return <section className="capbar">
    <button type="button" className="btn primary addnote-btn" onClick={() => setOpen(true)}><span aria-hidden="true">📝</span> Add note</button>
    <div className="capbar-meta">{reading && <span className="small muted">✨ Reading your latest note…</span>}
      {pending > 0 && <Link className="pill fu-pr-pending" href="/notes">✨ {pending} {pending === 1 ? "person" : "people"} to review</Link>}
      <Link className="colink small" href="/notes">All notes</Link></div>
    {open && <AddNoteWindow onClose={() => setOpen(false)} onSaved={() => mutate()} />}
  </section>;
}
type Draft = { kind: Item["kind"]; file?: File | Blob; text?: string; preview?: string; edited?: boolean; key?: number; typing?: boolean; itemId?: string };
/** The Add note window: pick (or create) the event, capture photos, cards, voice and text, then Save. */
type Person = { name: string; email?: string; phone?: string; company?: string; title?: string; source: "google" | "phone" };
export function AddNoteWindow({ onClose, onSaved, eventId: preset, person }: { onClose: () => void; onSaved: (id: string) => void; eventId?: string | null; person?: Person }) {
  const { m, perms, toast } = useData(); const r = useRecorder(); const photo = useRef<HTMLInputElement>(null); const card = useRef<HTMLInputElement>(null);
  const todayIso = new Date().toLocaleDateString("en-CA");
  const live = m.events.find((e) => e.startDate && e.startDate <= todayIso && (e.endDate || e.startDate) >= todayIso);
  const [eventId, setEventId] = useState<string>(() => preset !== undefined ? preset || "" : live?.id || (typeof window !== "undefined" ? localStorage.getItem("lt-note-event") || "" : ""));
  const [title, setTitle] = useState(""); const [drafts, setDrafts] = useState<Draft[]>([]); const [text, setText] = useState(""); const [busy, setBusy] = useState(false);
  const [newEv, setNewEv] = useState<{ name: string; startDate: string; endDate: string; location: string } | null>(null); const [events, setEvents] = useState(m.events);
  const dlg = useRef<HTMLDialogElement>(null); useEffect(() => { dlg.current?.showModal(); }, []);
  // ── auto-save: the note becomes a draft (only you can see it) the moment you add anything ──
  const [noteId, setNoteId] = useState<string | null>(null); const idRef = useRef<string | null>(null); const making = useRef<Promise<string> | null>(null);
  const [pending, setPending] = useState(0); const noteItem = useRef<string | null>(null); const sentText = useRef(""); const sentEdits = useRef<Record<string, string>>({});
  const work = async <T,>(f: () => Promise<T>): Promise<T | undefined> => { setPending((n) => n + 1); try { return await f(); } catch (e) { toast(e instanceof Error ? `Couldn't save the draft: ${e.message}` : "Couldn't save the draft.", "error"); return undefined; } finally { setPending((n) => n - 1); } };
  const defaultTitle = () => person ? `Note · ${person.name}` : `Note · ${new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
  const ensure = (): Promise<string> => { if (idRef.current) return Promise.resolve(idRef.current); if (making.current) return making.current;
    making.current = api<{ id: string }>("/api/stories", { json: { title: title.trim() || defaultTitle(), eventId: eventId || null, draft: true,
      ...(person ? { people: [{ name: person.name, ...(person.email ? { email: person.email } : {}), ...(person.phone ? { phone: person.phone } : {}), ...(person.company ? { company: person.company } : {}), ...(person.title ? { title: person.title } : {}), source: person.source }] } : {}) } })
      .then((n) => { idRef.current = n.id; setNoteId(n.id); window.dispatchEvent(new Event("lt:notes-changed")); return n.id; }).finally(() => { making.current = null; });
    return making.current; };
  const upload = (key: number, kind: Item["kind"], file?: File | Blob, txt?: string) => work(async () => { const id = await ensure(); const it = await addItem(id, kind, file, txt);
    setDrafts((d) => d.map((x) => (x.key === key ? { ...x, itemId: it.id } : x))); });
  // typed text saves itself a moment after you stop typing
  const saveText = async () => { const t = text.trim(); if (t === sentText.current) return; sentText.current = t;
    await work(async () => { if (!t) { if (noteItem.current && idRef.current) { await api(`/api/stories/${idRef.current}/items/${noteItem.current}`, { method: "DELETE" }); noteItem.current = null; } return; }
      const id = await ensure(); if (noteItem.current) await api(`/api/stories/${id}/items/${noteItem.current}`, { method: "PATCH", json: { text: t } }); else noteItem.current = (await addItem(id, "note", undefined, t)).id; }); };
  useEffect(() => { const h = setTimeout(saveText, 1200); return () => clearTimeout(h); }, [text]);   // eslint-disable-line react-hooks/exhaustive-deps
  // your edits to a voice note's words save themselves too
  useEffect(() => { const h = setTimeout(() => { for (const d of drafts) if (d.edited && d.itemId && d.text !== undefined && sentEdits.current[d.itemId] !== d.text) { const id = idRef.current!; const itemId = d.itemId; const t = d.text;
    sentEdits.current[itemId] = t; work(() => api(`/api/stories/${id}/items/${itemId}`, { method: "PATCH", json: { text: t } })); } }, 1200); return () => clearTimeout(h); }, [drafts]);   // eslint-disable-line react-hooks/exhaustive-deps
  // the title and event follow along once there's a draft
  useEffect(() => { if (!idRef.current) return; const h = setTimeout(() => work(() => api(`/api/stories/${idRef.current}`, { method: "PATCH", json: { ...(title.trim() ? { title: title.trim() } : {}), eventId: eventId || null } })), 800); return () => clearTimeout(h); }, [title, eventId]);   // eslint-disable-line react-hooks/exhaustive-deps
  const addFiles = async (kind: "photo" | "card", fs: File[]) => { for (const f of fs) { const s2 = await shrink(f); const key = Date.now() + Math.random();
    setDrafts((d) => [...d, { kind, file: s2, preview: URL.createObjectURL(s2), key }]); upload(key, kind, s2); } };
  const voice = async () => { if (r.state === "idle") { try { await r.start(); } catch { toast("Allow the microphone to record.", "error"); } return; }
    if (r.state !== "rec") return; const b = await r.stop(); r.setState("idle"); if (!b) { toast("Nothing was recorded. Check the microphone and try again.", "error"); return; }
    const key = Date.now(); const heard = r.lastLive.current;
    setDrafts((d) => [...d, { kind: "voice", file: b, text: heard, preview: URL.createObjectURL(b), key, typing: true }]); upload(key, "voice", b, heard);   // saved straight away
    // type it out now (you see the words, can edit or polish them, before saving)
    transcribeBlob(b).then((t) => setDrafts((d) => d.map((x) => (x.key === key ? { ...x, typing: false, text: x.edited ? x.text : (t || x.text) } : x))))
      .catch((e) => { setDrafts((d) => d.map((x) => (x.key === key ? { ...x, typing: false } : x))); toast(e instanceof Error ? `Couldn't type out the voice note: ${e.message}` : "Couldn't type out the voice note.", "error"); }); };
  const makeEvent = async () => { if (!newEv?.name.trim()) return;
    try { const e = await api<{ id: string; name: string; startDate: string | null; endDate: string | null }>("/api/events", { json: { name: newEv.name.trim(), ...(newEv.startDate ? { startDate: newEv.startDate, endDate: newEv.endDate || newEv.startDate } : {}), location: newEv.location } });
      setEvents((x) => [e as never, ...x]); setEventId(e.id); setNewEv(null); toast(`Event "${e.name}" added`); } catch (err) { toast(err instanceof Error ? err.message : "Couldn't add the event.", "error"); } };
  const save = async () => { if (!count) return; setBusy(true);
    try { await saveText(); while (making.current) await making.current; const id = await ensure(); const ev = events.find((e) => e.id === eventId);
      await api(`/api/stories/${id}`, { method: "PATCH", json: { draft: false, ...(title.trim() ? { title: title.trim() } : {}), eventId: eventId || null } });
      if (eventId) localStorage.setItem("lt-note-event", eventId); else localStorage.removeItem("lt-note-event");
      window.dispatchEvent(new Event("lt:notes-changed"));
      toast(`Note saved${ev ? ` to ${ev.name}` : ""}. ✨ AI is reading it now; you'll get a notification if it finds someone.`); onSaved(id); onClose(); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't save the note.", "error"); setBusy(false); } };
  // Close keeps it as a draft; Discard throws it away
  const close = async () => { if (r.state === "rec") await voice(); await saveText();
    if (idRef.current || making.current) toast("Saved to Drafts. Find it under Notes → Drafts to finish it or discard it.");
    onClose(); };
  const discard = async () => { if (!confirm("Discard this note? Everything in it is deleted.")) return;
    const id = idRef.current || (making.current ? await making.current : null); if (id) await api(`/api/stories/${id}`, { method: "DELETE" }).catch(() => undefined);
    window.dispatchEvent(new Event("lt:notes-changed")); toast("Note discarded."); onClose(); };
  const count = drafts.length + (text.trim() ? 1 : 0);
  return <dialog ref={dlg} className="addnote" onCancel={(e) => { e.preventDefault(); if (e.target !== e.currentTarget) return;   /* a closed camera or file picker, not the window */ if (!busy) close(); }} aria-label="Add note"><div className="dlg form">
    <header><h3 style={{ margin: 0 }}>{person ? `Note about ${person.name}` : "Add note"}</h3><button type="button" className="linkbtn" onClick={close}>Close</button></header>
    <label>Event<select value={eventId} onChange={(e) => { if (e.target.value === "__new") { if (!perms.manage) { toast("Only managers and admins can add events. Pick one, or ask a manager to add it.", "error"); return; } setNewEv({ name: "", startDate: todayIso, endDate: "", location: "" }); return; } setEventId(e.target.value); }}>
      <option value="">No event</option>{events.map((e) => <option key={e.id} value={e.id}>{e.name}{e.id === live?.id ? " (today)" : ""}</option>)}<option value="__new">{perms.manage ? "+ New event…" : "+ New event (ask a manager)"}</option></select></label>
    {newEv && <div className="an-newev"><input value={newEv.name} onChange={(e) => setNewEv({ ...newEv, name: e.target.value })} placeholder="Event name, e.g. Spring Expo 2026" aria-label="Event name" autoFocus />
      <div className="two"><label>Starts<input type="date" value={newEv.startDate} onChange={(e) => setNewEv({ ...newEv, startDate: e.target.value })} /></label><label>Ends<input type="date" value={newEv.endDate} onChange={(e) => setNewEv({ ...newEv, endDate: e.target.value })} /></label></div>
      <input value={newEv.location} onChange={(e) => setNewEv({ ...newEv, location: e.target.value })} placeholder="Location (optional)" aria-label="Location" />
      <div className="btns"><button type="button" className="btn sm primary" disabled={!newEv.name.trim()} onClick={makeEvent}>Add event</button><button type="button" className="btn sm ghost" onClick={() => setNewEv(null)}>Cancel</button></div></div>}
    <label>Title <span className="muted small">(optional: AI names it after the person you met)</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Dinner with ECL Gaming" /></label>
    <div className="cap-btns">
      <PickImages icon="📸" label="Photo" onFiles={(fs) => addFiles("photo", fs)} />
      <PickImages icon="🪪" label="Card" onFiles={(fs) => addFiles("card", fs)} />
      <button type="button" className={"cap-b" + (r.state === "rec" ? " rec" : "")} onClick={voice}><span>🎙</span>{r.state === "rec" ? `Stop ${r.secs}s` : r.state === "starting" ? (r.slow ? "Allow the mic ↑" : "Starting…") : "Voice"}</button></div>
    {r.state === "rec" && <div className="rec-live" aria-live="polite">● {r.secs}s · {r.live || "Listening… start speaking"}</div>}
    {drafts.length > 0 && <ul className="an-drafts">{drafts.map((d, i) => <li key={i} className={d.kind === "voice" ? "an-voice" : ""}>{d.kind === "voice" ? <><span className="an-k">🎙</span>
        <div className="an-vt">{d.text ? <AiText kind="note" rows={2} value={d.text} onChange={(e) => { const v = e.target.value; setDrafts((x) => x.map((y, k) => (k === i ? { ...y, text: v, edited: true } : y))); }} aria-label="Voice note text" />
          : <span className="small muted">{d.typing ? "✨ Typing what you said…" : "Voice note: couldn't type it out here; it's transcribed after saving"}</span>}
          {d.edited && <span className="small muted">Your version is kept.</span>}</div></>
      : <><img src={d.preview} alt="" /><span className="small">{d.kind === "card" ? "🪪 Card" : "📸 Photo"}</span></>}
      <button type="button" className="linkbtn" onClick={() => { const it = d.itemId; setDrafts((x) => x.filter((_, k) => k !== i)); if (it && idRef.current) work(() => api(`/api/stories/${idRef.current}/items/${it}`, { method: "DELETE" })); }} aria-label="Remove">✕</button></li>)}</ul>}
    <label>✏️ Note<AiText kind="note" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Who you met, what they need, what to follow up…" /></label>
    <div className="btns"><button type="button" className="btn primary" disabled={!count || busy || r.state === "rec"} onClick={save}>{busy ? "Saving…" : "Save note"}</button>
      {noteId && <button type="button" className="btn ghost danger-outline" disabled={busy} onClick={discard}>Discard</button>}
      <span className="small muted an-status" aria-live="polite">{pending > 0 ? "Saving draft…" : noteId ? "✓ Draft saved · Close keeps it in Notes → Drafts" : count ? `${count} item${count === 1 ? "" : "s"}` : "Add a photo, card, voice note or text"}</span></div>
  </div></dialog>;
}
/** The Notes page: events (with their notes), an event's notes, or one note. */
export function StoriesView() {
  const sp = useSearchParams(); const id = sp.get("id"); const ev = sp.get("event"); const router = useRouter(); const { m, perms, toast } = useData();
  const { data, mutate } = useSWR<{ stories: Story[] }>("/api/stories", fetcher, { refreshInterval: (d) => (d?.stories.some((x) => x.reading) ? 4000 : 0) });
  useEffect(() => { const h = () => mutate(); window.addEventListener("lt:notes-changed", h); return () => window.removeEventListener("lt:notes-changed", h); }, [mutate]);
  if (id) return <StoryDetail id={id} onBack={(evId) => { router.push(evId === undefined ? "/notes" : `/notes?event=${evId || "none"}`); mutate(); }} />;
  const all = data?.stories || []; const drafts = all.filter((x) => x.draft && x.mine); const list = all.filter((x) => !x.draft);
  const groups = new Map<string, Story[]>(); for (const x of list) { const k = x.eventId || "none"; groups.set(k, [...(groups.get(k) || []), x]); }
  const evName = (k: string) => (k === "none" ? "No event" : m.events.find((e) => e.id === k)?.name || "Event");
  const evDates = (k: string) => { const e = m.events.find((x) => x.id === k); return e?.startDate ? new Date(`${e.startDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""; };
  if (ev) { const notes = groups.get(ev) || [];
    return <div className="dir">
      <div className="dir-head"><button type="button" className="linkbtn" onClick={() => router.push("/notes")}>← All events</button>
        {notes.some((x) => x.mine) && <button type="button" className="btn sm ghost danger-outline" onClick={async () => { const mine = notes.filter((x) => x.mine);
          if (!confirm(`Delete all ${mine.length} of your note${mine.length === 1 ? "" : "s"} in ${evName(ev)}? This can't be undone.${mine.length < notes.length ? " Notes other people shared with you stay." : ""}`)) return;
          try { const r = await api<{ done: number; failed: { reason: string }[] }>("/api/bulk-delete", { json: { kind: "note", ids: mine.map((x) => x.id) } }); toast(`Deleted ${r.done} note${r.done === 1 ? "" : "s"}`); mutate(); router.push("/notes"); }
          catch (e) { toast(e instanceof Error ? e.message : "Couldn't delete them.", "error"); } }}>Delete all notes in this event</button>}
      </div>
      <h2 style={{ margin: 0 }}>{evName(ev)} <span className="small muted">{evDates(ev)}</span></h2>
      <NoteCards notes={notes} />
    </div>; }
  const keys = [...groups.keys()].sort((a, b) => Math.max(...groups.get(b)!.map((x) => x.updatedAt)) - Math.max(...groups.get(a)!.map((x) => x.updatedAt)));
  return <div className="dir">
    <div className="dir-head"><div className="dir-count"><b className="num">{data ? list.length : "…"}</b><span>{list.length === 1 ? "note" : "notes"}</span></div>
    </div>
    <p className="small muted" style={{ margin: 0 }}>Notes from events: photos with people, business cards, voice notes and text, grouped by event. Nothing becomes a contact until you say so; AI suggests who to add.</p>
    {drafts.length > 0 && <section className="panel st-drafts"><h2 style={{ margin: 0 }}>📝 Drafts ({drafts.length}) <span className="small muted">only you can see these: open one to finish it, then Save note or Discard</span></h2>
      <NoteCards notes={drafts} /></section>}
    {keys.length ? <BulkSelect kind="note" noun={["event", "events"]} selectLabel="Select events" ids={keys} expand={(ks) => ks.flatMap((k) => (groups.get(k) || []).filter((x) => x.mine).map((x) => x.id))}><div className="st-grid">{keys.map((k) => { const ns = groups.get(k)!; const pend = ns.reduce((n, x) => n + x.pending, 0); const thumbs = ns.flatMap((x) => x.thumbs).slice(0, 4);
      return <Link key={k} data-sel-id={k} href={`/notes?event=${k}`} className="panel st-card">
        <div className="st-thumbs">{thumbs.length ? thumbs.map((t) => <img key={t} src={t} alt="" loading="lazy" />) : <span className="muted small">No photos yet</span>}</div>
        <b>{evName(k)}</b><span className="small muted">{ns.length} note{ns.length === 1 ? "" : "s"}{evDates(k) ? ` · ${evDates(k)}` : ""}</span>
        {pend > 0 && <span className="pill fu-pr-pending">✨ {pend} to review</span>}</Link>; })}</div></BulkSelect>
      : <section className="panel"><p className="muted" style={{ margin: 0 }}>{data ? "No notes yet. Use Add note at the top of the screen." : "Loading…"}</p></section>}
  </div>;
}
function NoteCards({ notes }: { notes: Story[] }) {
  if (!notes.length) return <section className="panel"><p className="muted" style={{ margin: 0 }}>No notes here yet.</p></section>;
  return <BulkSelect kind="note" noun={["note", "notes"]} ids={notes.filter((s) => s.mine).map((s) => s.id)}><div className="st-grid">{notes.map((s) => <Link key={s.id} data-sel-id={s.mine ? s.id : undefined} href={`/notes?id=${s.id}`} className={"panel st-card" + (s.draft ? " is-draft" : "")}>
    {s.draft && <span className="pill draft-pill">📝 Draft</span>}
    <div className="st-thumbs">{s.thumbs.length ? s.thumbs.map((t) => <img key={t} src={t} alt="" loading="lazy" />) : <span className="muted small">{s.voice ? "🎙 Voice note" : "✏️ Text"}</span>}</div>
    <b>{s.title}</b><span className="small muted">{[s.photos && `${s.photos} photo${s.photos > 1 ? "s" : ""}`, s.cards && `${s.cards} card${s.cards > 1 ? "s" : ""}`, s.voice && `${s.voice} voice`, s.notes && `${s.notes} text`].filter(Boolean).join(" · ") || "Empty"} · {new Date(s.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{s.shared ? " · shared" : ""}</span>
    {s.reading > 0 && <span className="small muted">✨ Reading…</span>}{s.pending > 0 && <span className="pill fu-pr-pending">✨ {s.pending} to review</span>}</Link>)}</div></BulkSelect>;
}
function StoryDetail({ id, onBack }: { id: string; onBack: (eventId?: string | null) => void }) {
  const { m, run, toast, reload } = useData(); const { data, mutate } = useSWR<Full>(`/api/stories/${id}`, fetcher, { refreshInterval: (d) => (d?.items?.some((x) => x.aiStatus === "pending") ? 3000 : 0) });
  const [edit, setEdit] = useState<Record<string, string>>({}); const [itemEdit, setItemEdit] = useState<{ id: string; text: string } | null>(null);
  const [dupe, setDupe] = useState<Record<string, { id: string; name: string }>>({}); const [aside, setAside] = useState(false); const [summing, setSumming] = useState(false);
  const [madeTasks, setMadeTasks] = useState<string[]>([]); const [notNow, setNotNow] = useState<string[]>([]); const [fu, setFu] = useState<{ title: string; due: string }>({ title: "", due: "" });
  if (!data) return <p className="muted">Loading…</p>; if (!("items" in data)) return <p className="muted">This note isn't available.</p>;
  const people = data.items.flatMap((it) => it.found.map((f, i) => ({ it, f, i }))).filter((x) => x.f.status === "new");
  const setAsidePeople = data.items.flatMap((it) => it.found.map((f, i) => ({ it, f, i }))).filter((x) => x.f.status === "dismissed");
  const done = data.items.flatMap((it) => it.found.map((f) => f)).filter((f) => f.status === "added" || f.status === "company");
  const val = (k: string, f: Found, field: keyof Found) => edit[`${k}.${field}`] ?? String(f[field] || "");
  const act = async (it: Item, i: number, action: "contact" | "company" | "dismiss" | "link", extra: Record<string, unknown> = {}) => {
    const onlyContact = extra.withCompany === false; const k = `${it.id}.${i}`; const f = it.found[i];
    const fields = Object.fromEntries((["name", "title", "company", "email", "phone"] as const).map((x) => [x, val(k, f, x)]));
    const r = await fetch(`/api/stories/${id}/items/${it.id}/found/${i}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...fields, ...extra }) }); const j = await r.json().catch(() => ({}));
    if (r.status === 409 && j.existing) { setDupe({ ...dupe, [k]: j.existing }); return; }
    if (!r.ok) { toast(j.error || "Couldn't save that.", "error"); return; }
    toast(action === "contact" ? (onlyContact || !fields.company ? `${fields.name} added as a contact` : `${fields.name} and ${fields.company} added`) : action === "link" ? "Card and note added to their timeline" : action === "company" ? `${fields.company} added` : "Set aside. You can still add them from Set aside."); mutate(); };
  const linked = data.items.flatMap((it) => it.found).find((f) => f.status === "added" && f.contactId) || data.items.flatMap((it) => it.found).find((f) => f.companyId);
  // a task made from this note is remembered on the note (it links to the task, even after closing and reopening)
  const made = data.summary?.tasks || {};
  const taskOf = (title: string) => { const id = made[title]; return id && m.tasks.some((t) => t.id === id) ? id : null; };
  const makeTask = async (title: string, due?: string) => { const r = await run(() => api<{ id: string }>("/api/tasks", { json: { title: title.slice(0, 300), dueDate: due || null, notes: `From the note "${data.title}"`, contactIds: [...new Set([...(data.contactIds || []), ...(linked?.contactId ? [linked.contactId] : [])])], companyIds: [...new Set([...(data.companyIds || []), ...(linked?.companyId ? [linked.companyId] : [])])] } }),
      `Task created${linked ? ` for ${linked.contactId ? linked.name : linked.company}` : ""}`) as { id: string } | null;
    if (r?.id) { setMadeTasks((x) => [...x, title]); if (data.summary) await api(`/api/stories/${id}/summary`, { method: "PATCH", json: { task: { title, id: r.id } } }).catch(() => undefined); mutate(); }
    return !!r; };
  const notAdded = [...people, ...setAsidePeople];
  const dismissedSteps = data.summary?.dismissed || [];
  const dismissStep = async (x: string) => { await run(() => api(`/api/stories/${id}/summary`, { method: "PATCH", json: { dismiss: x } }), "Dismissed"); mutate(); };
  const NextBest = () => { const first = notAdded.find((x) => x.f.status === "new"); const step = data.summary?.nextSteps.find((x) => !madeTasks.includes(x) && !taskOf(x) && !dismissedSteps.includes(x));
    if (first) return <div className="st-nba"><b className="small">⭐ Next best action</b><span>Add <b>{first.f.name}</b>{first.f.company ? ` (${first.f.company})` : ""} as a contact first, so follow-ups land on their timeline.</span>
      <div className="btns">{first.f.company ? <><button type="button" className="btn sm primary" onClick={() => act(first.it, first.i, "contact")}>Add contact & company</button>
          <button type="button" className="btn sm" onClick={() => act(first.it, first.i, "contact", { withCompany: false })}>Contact only</button>
          <button type="button" className="btn sm" onClick={() => act(first.it, first.i, "company")}>Company only</button></>
        : <button type="button" className="btn sm primary" onClick={() => act(first.it, first.i, "contact")}>Add contact</button>}
        {first.f.status === "new" && <button type="button" className="btn sm ghost" onClick={() => act(first.it, first.i, "dismiss")}>Not now</button>}</div></div>;
    if (step) return <div className="st-nba"><b className="small">⭐ Next best action</b><span>{step}</span><div className="btns"><button type="button" className="btn sm primary" onClick={() => makeTask(step, data.summary?.dues?.[data.summary.nextSteps.indexOf(step)])}>Create task</button><button type="button" className="btn sm ghost" onClick={() => dismissStep(step)}>Dismiss</button></div></div>;
    return null; };
  const LABEL: Record<Item["kind"], string> = { photo: "📸 Photo", card: "🪪 Card", voice: "🎙 Voice note", note: "✏️ Text" };
  const askPeople = data.mine ? (data.people || []).filter((p) => !notNow.includes(p.name)) : [];
  const savePerson = async (p: Person) => {
    try { const exists = p.email ? m.contacts.find((c) => [c.email, ...(c.otherEmails || [])].some((e) => e && e.toLowerCase() === p.email!.toLowerCase())) : undefined;
      const cid = exists ? exists.id : (await api<{ id: string }>("/api/contacts", { json: { name: p.name, ...(p.email ? { email: p.email } : {}), ...(p.phone ? { phone: p.phone } : {}), ...(p.company ? { company: p.company } : {}), ...(p.title ? { title: p.title } : {}) } })).id;
      await api(`/api/stories/${id}`, { method: "PATCH", json: { people: (data.people || []).filter((x) => x !== p), contactIds: [...new Set([...(data.contactIds || []), cid])] } });
      toast(exists ? `${p.name} is already a contact: this note is now linked to them` : `${p.name} saved as a contact and linked to this note`); reload(); mutate(); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't save them.", "error"); } };
  return <div className="dir story">
    {askPeople.map((p) => <section key={p.name} className="panel person-ask" role="status"><div><b>Save {p.name} as a contact?</b> <span className="small muted">This note is about them, but they're only in your {p.source === "google" ? "Google" : "phone"} contacts.{[p.title, p.company].filter(Boolean).length ? ` ${[p.title, p.company].filter(Boolean).join(" · ")}` : ""}</span></div>
      <div className="btns"><button type="button" className="btn primary sm" onClick={() => savePerson(p)}>Save contact</button><button type="button" className="btn ghost sm" onClick={() => setNotNow([...notNow, p.name])}>Not now</button></div></section>)}
    {data.draft && <section className="panel draft-banner" role="status"><div><b>📝 Draft</b> <span className="small muted">Only you can see it. Add more below, then save it or discard it.</span></div>
      <div className="btns"><button type="button" className="btn primary sm" onClick={async () => { await run(() => api(`/api/stories/${id}`, { method: "PATCH", json: { draft: false } }), "Note saved. ✨ AI is reading it."); window.dispatchEvent(new Event("lt:notes-changed")); mutate(); }}>Save note</button>
        <button type="button" className="btn ghost sm danger-outline" onClick={async () => { if (!confirm("Discard this draft? Everything in it is deleted.")) return; await run(() => api(`/api/stories/${id}`, { method: "DELETE" }), "Draft discarded"); window.dispatchEvent(new Event("lt:notes-changed")); onBack(undefined); }}>Discard</button></div></section>}
    <div className="dir-head"><button type="button" className="linkbtn" onClick={() => onBack(data.draft ? undefined : data.eventId)}>← {data.eventId ? m.events.find((e) => e.id === data.eventId)?.name || "Event" : "No event"}</button>
      {data.mine && !data.draft && <div className="dir-tools"><ShareButton entity="note" id={id} shared={data.shared} sharedWith={data.sharedWith || []} onDone={() => mutate()} what="this note" />
        <button className="btn sm ghost" onClick={async () => { if (confirm(`Delete "${data.title}" and everything in it? Contacts you added from it stay.`)) { await run(() => api(`/api/stories/${id}`, { method: "DELETE" }), "Note deleted"); onBack(data.eventId); } }}>Delete</button></div>}</div>
    <section className="panel st-head">{data.mine ? <input className="st-title" value={edit.title ?? data.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} onBlur={async () => { if (edit.title && edit.title !== data.title) { await api(`/api/stories/${id}`, { method: "PATCH", json: { title: edit.title } }); mutate(); } }} aria-label="Note title" /> : <h2 style={{ margin: 0 }}>{data.title}</h2>}
      {data.mine && <select value={data.eventId || ""} onChange={async (e) => { await run(() => api(`/api/stories/${id}`, { method: "PATCH", json: { eventId: e.target.value || null } }), "Saved"); mutate(); }} aria-label="Event"><option value="">No event</option>{m.events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}</select>}
      {data.mine && <><span className="small muted">Add more to this note:</span><CaptureButtons storyId={async () => id} onAdded={() => { mutate(); toast("Added. ✨ AI is reading it."); }} /></>}</section>
    <section className="panel st-links"><h3 style={{ margin: 0 }}>Linked to <span className="small muted">· shows on their pages</span></h3>
      {data.mine ? <LinkPicker linkable leadIds={data.contactIds || []} coIds={data.companyIds || []} onChange={async (contactIds, companyIds) => { await run(() => api(`/api/stories/${id}`, { method: "PATCH", json: { contactIds, companyIds } }), "Links saved"); mutate(); }} />
        : <div className="chips">{[...(data.contactIds || []).filter((x) => m.contactMap.has(x)).map((x) => <Link key={x} className="chip chip-open" href={`/contacts?id=${x}`}>{m.contactMap.get(x)!.name} ↗</Link>),
            ...(data.companyIds || []).filter((x) => m.companyMap.has(x)).map((x) => <Link key={x} className="chip chip-open" href={`/companies?id=${x}`}>{m.companyMap.get(x)!.name} ↗</Link>)]}
          {!(data.contactIds || []).some((x) => m.contactMap.has(x)) && !(data.companyIds || []).some((x) => m.companyMap.has(x)) && <span className="small muted">Not linked yet.</span>}</div>}</section>
    {m.config.ai && data.items.length > 0 && <AiFold id="note-summary" title="note summary"><section className="panel st-sum"><div className="q-h"><h3 style={{ margin: 0 }}>✨ Summary</h3><span className="ai-hdr-btns">
        <button type="button" className="btn sm" disabled={summing} onClick={async () => { setSumming(true); await run(() => api(`/api/stories/${id}/summary`, { method: "POST" })); setSumming(false); mutate(); }}>{summing ? "Summarizing…" : data.summary ? "Refresh" : "Summarize"}</button><FoldBtn /></span></div>
      {data.summary ? <><p style={{ margin: 0 }}><Linkify text={data.summary.summary} /></p>
        {data.summary.keyPoints.length > 0 && <><b className="small">Key points</b><ul>{data.summary.keyPoints.map((x, i) => <li key={i}><Linkify text={x} /></li>)}</ul></>}
        <NextBest />
        {data.summary.nextSteps.some((x) => !dismissedSteps.includes(x)) && <><b className="small">Next steps</b><ul className="st-steps">{data.summary.nextSteps.map((x, i) => dismissedSteps.includes(x) ? null : <li key={i}><span><Linkify text={x} />{data.summary!.dues?.[i] ? <span className="small muted"> · by {new Date(`${data.summary!.dues[i]}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span> : null}</span>
          {taskOf(x) ? <Link className="small colink" href={`/tasks?id=${taskOf(x)}`}>✓ Task created · Open</Link> : madeTasks.includes(x) ? <span className="small muted">✓ Task created</span> : <span className="st-step-b"><button type="button" className="btn sm" onClick={() => makeTask(x, data.summary!.dues?.[i])}>+ Task</button><button type="button" className="linkbtn st-x" onClick={() => dismissStep(x)} aria-label={`Dismiss: ${x}`} title="Dismiss">✕</button></span>}</li>)}</ul></>}
        {dismissedSteps.length > 0 && <span className="small muted">{dismissedSteps.length} step{dismissedSteps.length === 1 ? "" : "s"} dismissed · <button type="button" className="linkbtn small" onClick={async () => { for (const x of dismissedSteps) await api(`/api/stories/${id}/summary`, { method: "PATCH", json: { restore: x } }); mutate(); }}>Show again</button></span>}
        <span className="small muted">Written by AI {new Date(data.summary.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}. Refresh after adding more.</span></>
        : <p className="small muted" style={{ margin: 0 }}>Get a short summary, key points, next steps and the next best action from everything in this note.</p>}
      {Object.entries(made).filter(([t, tid]) => !data.summary?.nextSteps.includes(t) && m.tasks.some((x) => x.id === tid)).length > 0 && <div className="st-made"><b className="small">Tasks from this note</b>
        {Object.entries(made).filter(([t, tid]) => !data.summary?.nextSteps.includes(t) && m.tasks.some((x) => x.id === tid)).map(([t, tid]) => <Link key={tid} className="colink small" href={`/tasks?id=${tid}`}>✓ {t}</Link>)}</div>}
      <div className="st-fu"><input value={fu.title} onChange={(e) => setFu({ ...fu, title: e.target.value })} placeholder="Add follow-up task, e.g. Send pricing to Tim" aria-label="Follow-up task" />
        <input type="date" value={fu.due} onChange={(e) => setFu({ ...fu, due: e.target.value })} aria-label="Due" />
        <button type="button" className="btn sm primary" disabled={!fu.title.trim()} onClick={async () => { if (await makeTask(fu.title.trim(), fu.due || undefined)) setFu({ title: "", due: "" }); }}>Add task</button></div></section></AiFold>}
    {(people.length > 0 || setAsidePeople.length > 0) && <AiFold id="note-people" title="People found"><section className="panel st-found"><div style={{ float: "right" }}><FoldBtn link /></div>{people.length > 0 && <h3 style={{ margin: 0 }}>✨ People found <span className="small muted">· add them as contacts?</span></h3>}
      {[...people, ...(aside ? setAsidePeople : [])].map(({ it, f, i }) => { const k = `${it.id}.${i}`; const isAside = f.status === "dismissed"; return <div key={k} className={"st-person" + (isAside ? " aside" : "")}>
        {it.url && (it.kind === "card" || it.kind === "photo") && <a href={it.url} className="st-pthumb"><img src={it.url} alt="" /></a>}
        <div className="st-pf">{(["name", "title", "company", "email", "phone"] as const).map((x) => <label key={x}><span className="small muted">{x[0].toUpperCase() + x.slice(1)}</span>
          <input value={val(k, f, x)} onChange={(e) => setEdit({ ...edit, [`${k}.${x}`]: e.target.value })} /></label>)}<span className="small muted">From a {f.from === "voice" ? "voice note" : f.from}</span></div>
        {dupe[k] ? <div className="st-dupe"><span className="small"><b>Already a contact:</b> <Link className="colink" href={`/contacts?id=${dupe[k].id}`}>{dupe[k].name}</Link> (same email)</span>
          <div className="btns"><button type="button" className="btn sm primary" onClick={() => act(it, i, "link", { contactId: dupe[k].id })}>Add the card and note to them</button><button type="button" className="btn sm" onClick={() => act(it, i, "contact", { anyway: true })}>Add as a new contact anyway</button></div></div>
        : <div className="btns">{val(k, f, "company") ? <><button type="button" className="btn sm primary" onClick={() => act(it, i, "contact")}>Add contact & company</button>
            <button type="button" className="btn sm" onClick={() => act(it, i, "contact", { withCompany: false })}>Contact only</button>
            <button type="button" className="btn sm" onClick={() => act(it, i, "company")}>Company only</button></>
          : <button type="button" className="btn sm primary" onClick={() => act(it, i, "contact")}>Add contact</button>}{isAside ? <span className="small muted">Set aside</span> : <button type="button" className="btn sm ghost" onClick={() => act(it, i, "dismiss")}>Not now</button>}</div>}</div>; })}
      {setAsidePeople.length > 0 && <button type="button" className="linkbtn small st-aside-t" onClick={() => setAside(!aside)} aria-expanded={aside}>{aside ? "▾ Hide" : "▸ Show"} set aside ({setAsidePeople.length})</button>}</section></AiFold>}
    {done.length > 0 && <p className="small muted" style={{ margin: 0 }}>Added from this note: {done.map((f, i) => <span key={i}>{i ? ", " : ""}{f.contactId ? <Link className="colink" href={`/contacts?id=${f.contactId}`}>{f.name}</Link> : f.companyId ? <Link className="colink" href={`/companies?id=${f.companyId}`}>{f.company}</Link> : f.name}</span>)}</p>}
    <section className="panel st-items">{data.items.length ? data.items.map((it) => <div key={it.id} className={"st-item k-" + it.kind}>
      <div className="small muted st-ih"><b>{LABEL[it.kind]}</b> · {new Date(it.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{it.editedAt ? " · edited" : ""}{it.aiStatus === "pending" ? " · ✨ Reading…" : it.found.length ? ` · ✨ ${it.found.map((f) => f.name).join(", ")}` : ""}
        {data.mine && <span className="st-acts">{(it.kind === "note" || it.kind === "voice") && <button type="button" className="linkbtn" onClick={() => setItemEdit({ id: it.id, text: it.text })}>Edit</button>}
          <button type="button" className="linkbtn" onClick={async () => { if (confirm("Delete this from the note?")) { await run(() => api(`/api/stories/${id}/items/${it.id}`, { method: "DELETE" }), "Deleted"); mutate(); } }}>Delete</button></span>}</div>
      {it.url && (it.kind === "photo" || it.kind === "card") && <a href={it.url} className="st-img"><img src={it.url} alt={LABEL[it.kind]} loading="lazy" /></a>}
      {it.kind === "voice" && it.url && <audio src={it.url} controls preload="none" style={{ width: "100%" }} />}
      {itemEdit?.id === it.id ? <div className="t-edit"><textarea rows={Math.min(12, Math.max(3, itemEdit.text.split("\n").length + 1))} value={itemEdit.text} onChange={(e) => setItemEdit({ ...itemEdit, text: e.target.value })} aria-label="Edit" autoFocus />
        <div className="btns"><button type="button" className="btn sm primary" onClick={async () => { if (await run(() => api(`/api/stories/${id}/items/${it.id}`, { method: "PATCH", json: { text: itemEdit.text } }), "Saved")) { setItemEdit(null); mutate(); } }}>Save</button><button type="button" className="btn sm ghost" onClick={() => setItemEdit(null)}>Cancel</button></div></div>
        : it.text && <p className="st-text"><Linkify text={it.text} /></p>}
    </div>) : <p className="muted" style={{ margin: 0 }}>Nothing in this note yet. Use the buttons above.</p>}</section>
  </div>;
}

/** On a lead's or company's page: the notes linked to them. */
/** On a phone's lead conversation: "📝 2 notes ›", straight to their notes. */
export function NotesPin({ contactId }: { contactId: string }) {
  const { data } = useSWR<{ stories: Story[] }>(`/api/stories?contactId=${contactId}`, fetcher); const n = data?.stories.length || 0; if (!n) return null;
  return <Link href={`/contacts?id=${contactId}&view=details#notes`} className="mpin mpin-notes">📝 {n} note{n === 1 ? "" : "s"} about them ›</Link>;
}
export function LinkedNotes({ contactId, companyId }: { contactId?: string; companyId?: string }) {
  const { m } = useData();
  const { data } = useSWR<{ stories: Story[] }>(`/api/stories?${contactId ? `contactId=${contactId}` : `companyId=${companyId}`}`, fetcher);
  const list = data?.stories || []; if (!list.length) return null;
  const others = (s: Story) => [...((s as { contactIds?: string[] }).contactIds || []).filter((x) => x !== contactId && m.contactMap.has(x)).map((x) => ({ id: x, name: m.contactMap.get(x)!.name, href: `/contacts?id=${x}` })),
    ...((s as { companyIds?: string[] }).companyIds || []).filter((x) => x !== companyId && m.companyMap.has(x)).map((x) => ({ id: x, name: m.companyMap.get(x)!.name, href: `/companies?id=${x}` }))];
  return <div className="linked-notes"><h3 className="section-h" style={{ marginTop: 0 }}>Notes ({list.length}) <span className="small muted">tap one to open it</span></h3><ul className="rows">{list.map((s) => { const o = others(s);
    return <li key={s.id} className="ln-row"><Link className="colink" href={`/notes?id=${s.id}`}>📝 {s.title}</Link> <span className="small muted">· {new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{s.pending ? ` · ✨ ${s.pending} to review` : ""}</span>
      {o.length > 0 && <div className="ln-about small">{companyId ? "about " : "also linked to "}{o.map((x, i) => <span key={x.id}>{i ? ", " : ""}<Link className="colink" href={x.href}>{x.name}</Link></span>)}</div>}</li>; })}</ul></div>;
}
