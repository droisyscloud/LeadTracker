"use client";
import { useEffect, useMemo, useState } from "react";

type Avail = { name: string; image: string | null; title: string; intro: string; durations: number[]; online: boolean; timezone: string; days: Record<string, string[]> };
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init); const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Something went wrong. Please try again.");
  return j as T;
}

/** What a lead sees: pick a length, a day, a time, add their details, done. Times are shown in the visitor's own time zone. */
export function BookingWidget({ slug, brand }: { slug: string; brand: { name: string; footer: string } }) {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [a, setA] = useState<Avail | null>(null); const [err, setErr] = useState(""); const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(""); const [slot, setSlot] = useState("");
  const [f, setF] = useState({ name: "", email: "", company: "", phone: "", notes: "", website_url: "" });
  const [busy, setBusy] = useState(false); const [done, setDone] = useState<{ start: string; minutes: number; link: string | null } | null>(null);
  const myTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    setLoading(true); setErr("");
    call<Avail>(`/api/public/book/${slug}${minutes ? `?minutes=${minutes}` : ""}`).then((r) => { setA(r); if (!minutes) setMinutes(r.durations[0]); })
      .catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, [slug, minutes]);

  // regroup the owner's slots by the visitor's local date
  const byDay = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const list of Object.values(a?.days || {})) for (const iso of list) { const k = ymd(new Date(iso)); out.set(k, [...(out.get(k) || []), iso]); }
    return out;
  }, [a]);
  const first = [...byDay.keys()].sort()[0];
  const [view, setView] = useState<Date | null>(null);
  const month = view || (first ? new Date(`${first}T12:00:00`) : new Date());
  const mStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const cells: (Date | null)[] = [...Array((mStart.getDay() + 6) % 7).fill(null), ...Array.from({ length: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  const fmtT = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  const book = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { const r = await call<{ start: string; minutes: number; link: string | null }>(`/api/public/book/${slug}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, start: slot, minutes }) }); setDone(r); }
    catch (e2) { setErr((e2 as Error).message); if (/taken/.test((e2 as Error).message)) { setSlot(""); setMinutes((m) => m); call<Avail>(`/api/public/book/${slug}?minutes=${minutes}`).then(setA).catch(() => undefined); } }
    setBusy(false);
  };

  if (done) return <div className="bk-card bk-done">
    <div className="bk-tick" aria-hidden="true">✓</div>
    <h1>You're booked</h1>
    <p><b>{new Date(done.start).toLocaleString([], { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}</b> for {done.minutes} minutes with {a?.name}.</p>
    <p className="bk-muted">A calendar invite is on its way to {f.email}{done.link ? ", with the video call link" : ""}.</p>
    {done.link && <p><a className="bk-btn" href={done.link} target="_blank" rel="noopener">Video call link</a></p>}
  </div>;

  return <div className="bk-card">
    <header className="bk-head">
      {a?.image ? <img src={a.image} alt="" width={56} height={56} referrerPolicy="no-referrer" /> : <span className="bk-av">{(a?.name || brand.name || "?")[0]}</span>}
      <div><div className="bk-muted">{a?.name || " "}</div><h1>{a?.title || "Book a meeting"}</h1></div>
      <img className="bk-logo" src="/api/public/brand/mark" alt={brand.name} width={28} height={28} />
    </header>
    {a?.intro && <p className="bk-intro">{a.intro}</p>}
    {err && !a && <div className="bk-err">{err}</div>}
    {a && <>
      {a.durations.length > 1 && <div className="bk-row" role="radiogroup" aria-label="Meeting length">{a.durations.map((d) => <button key={d} type="button" aria-pressed={d === minutes} className="bk-pill" onClick={() => { setMinutes(d); setSlot(""); }}>{d} min</button>)}</div>}
      {!slot ? <div className="bk-grid">
        <div>
          <div className="bk-cal-h">
            <button type="button" aria-label="Previous month" onClick={() => setView(new Date(mStart.getFullYear(), mStart.getMonth() - 1, 1))} disabled={mStart <= new Date(new Date().getFullYear(), new Date().getMonth(), 1)}>‹</button>
            <b>{mStart.toLocaleDateString([], { month: "long", year: "numeric" })}</b>
            <button type="button" aria-label="Next month" onClick={() => setView(new Date(mStart.getFullYear(), mStart.getMonth() + 1, 1))}>›</button>
          </div>
          <div className="bk-cal">{WEEK.map((w) => <span key={w} className="bk-w">{w}</span>)}
            {cells.map((d, i) => { if (!d) return <span key={i} />; const k = ymd(d); const has = byDay.has(k);
              return <button key={k} type="button" className="bk-d" disabled={!has} aria-pressed={k === date} aria-label={fmtDay(k)} onClick={() => setDate(k)}>{d.getDate()}</button>; })}
          </div>
          <p className="bk-muted bk-tz">Times in {myTz.replace(/_/g, " ")}</p>
        </div>
        <div>
          {loading ? <p className="bk-muted">Loading free times…</p> : !byDay.size ? <p className="bk-muted">No free times in the coming weeks. Please reply to the email you received.</p>
            : !date ? <p className="bk-muted">Choose a day to see available times.</p>
            : <><h2>{fmtDay(date)}</h2><div className="bk-slots">{(byDay.get(date) || []).map((iso) => <button key={iso} type="button" className="bk-slot" onClick={() => setSlot(iso)}>{fmtT(iso)}</button>)}</div></>}
        </div>
      </div> : <form className="bk-form" onSubmit={book}>
        <div className="bk-chosen"><b>{new Date(slot).toLocaleString([], { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}</b>, {minutes} minutes{a.online ? ", video call" : ""} <button type="button" className="bk-link" onClick={() => setSlot("")}>Change</button></div>
        <label>Your name<input required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></label>
        <label>Work email<input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></label>
        <div className="bk-two"><label>Company<input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} autoComplete="organization" /></label>
          <label>Phone (optional)<input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" /></label></div>
        <label>Anything we should know? (optional)<textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
        <input className="bk-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website_url} onChange={(e) => setF({ ...f, website_url: e.target.value })} name="website_url" />
        {err && <div className="bk-err">{err}</div>}
        <button className="bk-btn" disabled={busy}>{busy ? "Booking…" : "Confirm booking"}</button>
      </form>}
    </>}
    <footer className="bk-foot">{brand.footer}</footer>
  </div>;
}
