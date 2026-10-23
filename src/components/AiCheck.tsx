"use client";
import { useState } from "react";
import { api, useData } from "./data";

/** Settings: one button to check voice transcription and the AI writer, with the real reason if something is wrong. */
export function AiCheck() {
  const { perms } = useData(); const [busy, setBusy] = useState(false); const [r, setR] = useState<{ voice: { ok: boolean; message: string }; ai: { ok: boolean; message: string }; recent?: { who: string; name: string; message: string; device: string; at: number }[] } | null>(null);
  if (!perms.admin) return null;
  return <section className="panel s12 aicheck"><h2>Voice and AI check</h2>
    <p className="small muted" style={{ margin: 0 }}>If the mic or voice notes type nothing, or AI features fail, run this. It sends a one-second test to the transcription service and a tiny request to the AI writer, and tells you exactly what's wrong (for example a key that's out of credit).</p>
    <div className="btns"><button type="button" className="btn" disabled={busy} onClick={async () => { setBusy(true); setR(null); try { setR(await api("/api/admin/check-ai", { method: "POST" })); } catch (e) { setR({ voice: { ok: false, message: e instanceof Error ? e.message : "Couldn't run the check." }, ai: { ok: false, message: "" } }); } setBusy(false); }}>{busy ? "Checking…" : "Check voice and AI"}</button></div>
    {r && <ul className="aicheck-r">
      <li className={r.voice.ok ? "ok" : "bad"}>{r.voice.ok ? "✓" : "⚠"} <b>Voice (mic and voice notes):</b> {r.voice.message}</li>
      {r.recent && r.recent.length > 0 && <li className="bad"><b>Recent mic problems on people's devices:</b><ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
        {r.recent.map((x, i) => <li key={i}>{new Date(x.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {x.who} · {x.message || x.name} <span className="muted">({x.device.slice(0, 70)})</span></li>)}</ul></li>}
      {r.recent && r.recent.length === 0 && <li className="ok">✓ No mic problems reported from anyone's device.</li>}
      {r.ai.message && <li className={r.ai.ok ? "ok" : "bad"}>{r.ai.ok ? "✓" : "⚠"} <b>AI writer (summaries, polish, assistant):</b> {r.ai.message}</li>}</ul>}
  </section>;
}
