"use client";
import { useState } from "react";
import { api, useData } from "../data";
import { Panel } from "../ui";
import { AiText } from "../AiText";

const DAYS = [["1", "Mon"], ["2", "Tue"], ["3", "Wed"], ["4", "Thu"], ["5", "Fri"], ["6", "Sat"], ["0", "Sun"]];
const slugOf = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 40);

/** Your public booking page: the link, when you're available and what leads see. */
export function BookingSettings() {
  const { m, run, toast } = useData();
  const b = m.booking;
  const [f, setF] = useState({
    enabled: b?.enabled ?? true, slug: b?.slug || slugOf(m.me.name || m.me.email.split("@")[0]), title: b?.title || `Meet with ${m.me.name?.split(" ")[0] || "me"}`,
    intro: b?.intro ?? `Pick a time that suits you for a short call with ${m.config.brand.companyName}.`, durations: b?.durations || [30], workdays: b?.workdays || [1, 2, 3, 4, 5],
    startHour: b?.startHour ?? 9, endHour: b?.endHour ?? 17, minNoticeHours: b?.minNoticeHours ?? 4, daysAhead: b?.daysAhead ?? 21, bufferMin: b?.bufferMin ?? 10, online: b?.online ?? true,
  });
  const url = `${m.appUrl}/book/${f.slug}`;
  const toggle = <T,>(l: T[], v: T) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);
  const save = () => run(() => api("/api/me/booking", { method: "PUT", json: f }), f.enabled ? "Booking page saved and live" : "Booking page saved (switched off)");
  const sel = (k: "startHour" | "endHour" | "minNoticeHours" | "daysAhead" | "bufferMin", opts: [number, string][]) =>
    <select value={f[k]} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
  const hours: [number, string][] = Array.from({ length: 25 }, (_, h) => [h, `${h}:00`]);
  return <Panel className="s12" title="Your booking page" sub="A link leads can use to pick a free time in your calendar. The meeting, invite and video link are created for you, and it's logged on their lead.">
    {!m.connection && <div className="banner" style={{ margin: "0 0 12px" }}>Connect your Google account above first. The booking page reads your free times from your calendar.</div>}
    <div className="form">
      <label className="inline" style={{ gap: 8, flexDirection: "row", alignItems: "center" }}><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} style={{ width: "auto" }} />Booking page is on</label>
      <label>Your link<div className="inline"><span className="small muted" style={{ whiteSpace: "nowrap" }}>{m.appUrl}/book/</span><input type="text" value={f.slug} onChange={(e) => setF({ ...f, slug: slugOf(e.target.value) })} /></div></label>
      <div className="two"><label>Page title<input type="text" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label>Meeting lengths offered<div className="chips" style={{ marginTop: 0 }}>{[15, 30, 45, 60, 90].map((d) => <button key={d} type="button" className="chip" aria-pressed={f.durations.includes(d)} onClick={() => setF({ ...f, durations: toggle(f.durations, d).sort((a, z) => a - z) })}>{d} min</button>)}</div></label></div>
      <label>Message on the page<AiText kind="message" rows={2} value={f.intro} onChange={(e) => setF({ ...f, intro: e.target.value })} /></label>
      <label>Days you take meetings<div className="chips" style={{ marginTop: 0 }}>{DAYS.map(([v, l]) => <button key={v} type="button" className="chip" aria-pressed={f.workdays.includes(Number(v))} onClick={() => setF({ ...f, workdays: toggle(f.workdays, Number(v)) })}>{l}</button>)}</div></label>
      <div className="two"><label>From{sel("startHour", hours.slice(0, 24))}</label><label>Until{sel("endHour", hours.slice(1))}</label></div>
      <div className="two">
        <label>Earliest booking{sel("minNoticeHours", [[0, "Any time"], [1, "1 hour ahead"], [4, "4 hours ahead"], [12, "12 hours ahead"], [24, "1 day ahead"], [48, "2 days ahead"]])}</label>
        <label>How far ahead{sel("daysAhead", [[7, "1 week"], [14, "2 weeks"], [21, "3 weeks"], [30, "1 month"], [60, "2 months"], [90, "3 months"]])}</label>
        <label>Gap around other meetings{sel("bufferMin", [[0, "None"], [5, "5 minutes"], [10, "10 minutes"], [15, "15 minutes"], [30, "30 minutes"]])}</label>
        <label className="inline" style={{ gap: 8, flexDirection: "row", alignItems: "center", marginTop: 22 }}><input type="checkbox" checked={f.online} onChange={(e) => setF({ ...f, online: e.target.checked })} style={{ width: "auto" }} />Add a {m.connection?.provider === "microsoft" ? "Teams" : "Google Meet"} link</label>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Times use your time zone ({m.me.timezone}); visitors see them in theirs.</p>
      <div className="btns"><button className="btn primary" disabled={!f.durations.length || !f.workdays.length || !f.slug} onClick={save}>Save booking page</button>
        {b?.enabled && <><a className="btn" href={b.url} target="_blank" rel="noopener">Open my page</a>
          <button className="btn" type="button" onClick={async () => { try { await navigator.clipboard.writeText(b.url); toast("Link copied"); } catch { toast("Copy failed", "error"); } }}>Copy link</button></>}</div>
      {b?.enabled && <p className="small" style={{ margin: 0 }}>Live at <a className="colink" href={b.url} target="_blank" rel="noopener">{url}</a>. Add it to emails with "Insert my booking link" or the {"{booking_link}"} placeholder in templates.</p>}
    </div>
  </Panel>;
}
