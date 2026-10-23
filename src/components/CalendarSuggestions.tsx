"use client";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { api, useData } from "./data";

/* Suggested tasks from upcoming calendar meetings: preview, pick, then add. Nothing is added automatically. */
type S = { id: string; kind: "prep" | "follow"; title: string; notes: string; dueDate: string | null; meetingTitle: string; meetingAt: number | null; contactId: string | null; companyId: string | null; sourceKey: string };
const fetcher = (u: string) => fetch(u).then((r) => r.json());
export function useSuggestions() { return useSWR<{ suggestions: S[] }>("/api/task-suggestions", fetcher, { refreshInterval: 120_000 }); }
export function CalendarSuggestions() {
  const { run, perms, m } = useData(); const { data, mutate } = useSuggestions(); const [off, setOff] = useState<Set<string>>(new Set());
  const list = data?.suggestions || []; if (!perms.write || !list.length) return null;
  const groups = new Map<string, S[]>(); for (const s of list) { const k = s.sourceKey.replace(/^(prep|follow):/, ""); groups.set(k, [...(groups.get(k) || []), s]); }
  const act = async (ids: string[], action: "add" | "dismiss") => { if (!ids.length) return;
    await run(() => api("/api/task-suggestions", { json: { ids, action } }), action === "add" ? `${ids.length} task${ids.length === 1 ? "" : "s"} added` : "Dismissed"); setOff(new Set()); mutate(); };
  const day = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "no date");
  return <section className="panel s12 calsug"><div className="q-h"><h3 style={{ margin: 0 }}>📅 Suggested from your calendar <span className="small muted">· nothing is added until you choose</span></h3>
      <button type="button" className="btn sm primary" onClick={() => act(list.filter((s) => !off.has(s.id)).map((s) => s.id), "add")}>Add all ticked ({list.filter((s) => !off.has(s.id)).length})</button></div>
    {[...groups.values()].map((g) => { const first = g[0]; const who = first.companyId ? m.companyMap.get(first.companyId)?.name : first.contactId ? m.contactMap.get(first.contactId)?.name : "";
      return <div key={first.sourceKey} className="calsug-m"><div className="small"><b>{first.meetingTitle}</b>{who ? ` with ${who}` : ""}{first.meetingAt ? ` · ${new Date(first.meetingAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}
          {first.contactId && <> · <Link className="colink" href={`/contacts?id=${first.contactId}`}>open</Link></>}</div>
        {g.map((s) => <label key={s.id} className="chk calsug-t"><input type="checkbox" checked={!off.has(s.id)} onChange={() => setOff((x) => { const n = new Set(x); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} />
          <span>{s.title} <span className="small muted">· due {day(s.dueDate)}{s.kind === "follow" ? " · also sets the follow-up date" : ""}</span></span></label>)}
        <div className="btns"><button type="button" className="btn sm" onClick={() => act(g.filter((s) => !off.has(s.id)).map((s) => s.id), "add")}>Add</button><button type="button" className="btn sm ghost" onClick={() => act(g.map((s) => s.id), "dismiss")}>Dismiss</button></div></div>; })}
  </section>;
}
/** A small pointer on Home when there are suggestions waiting. */
export function SuggestionsHint() {
  const { perms } = useData(); const { data } = useSuggestions(); const n = data?.suggestions.length || 0;
  if (!perms.write || !n) return null;
  return <Link href="/tasks" className="panel s12 calsug-hint">📅 {n} suggested task{n === 1 ? "" : "s"} from your calendar meetings. Review and choose what to add →</Link>;
}
