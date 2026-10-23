"use client";
import { useEffect, useRef, useState } from "react";
import type { ContactDTO } from "@/lib/types";
import { api, useData } from "./data";
import { Icon } from "./ui";
import { activeActions, ruleActions, type ActionKind, type NextAction } from "./nextAction";
import { todayStr } from "./model";
import { AiFold, FoldBtn } from "./AiFold";

type Ai = { action: string; why: string; kind: ActionKind | "wait"; dueInDays: number; generatedAt: number; stale: boolean };
const VERB: Record<ActionKind | "wait", string> = { email: "Write the email", call: "Log the call", meeting: "Book it", note: "Add a note", task: "Open tasks", wait: "Set a reminder" };

/**
 * The next best action for a lead, at the top of its page: the AI's suggestion when there is one,
 * otherwise the most urgent rule from the timeline, with one-tap ways to do it, make it a task, or snooze it.
 */
export function NextActionCard({ c, onDo }: { c: ContactDTO; onDo: (k: ActionKind) => void }) {
  const { m, run, perms, toast } = useData();
  const rules = activeActions(m, c, ruleActions(m, c));
  const [ai, setAi] = useState<Ai | null>(null); const [aiOn, setAiOn] = useState(false); const [busy, setBusy] = useState(false); const [more, setMore] = useState(false);
  const asked = useRef("");
  const sig = (m.actsByContact.get(c.id) || []).map((a) => a.id + (a.editedAt || "")).join(",") + c.status + c.nextFollowUp + c.rating;
  useEffect(() => {
    if (asked.current === c.id + sig) return; asked.current = c.id + sig;
    let live = true;
    api<{ ai: boolean; suggestion: Ai | null }>(`/api/contacts/${c.id}/next-action`).then((r) => {
      if (!live) return; setAiOn(r.ai); setAi(r.suggestion);
      // first visit, or the timeline changed since: ask for a fresh one in the background
      if (r.ai && perms.write && (!r.suggestion || r.suggestion.stale) && c.status !== "won" && c.status !== "lost")
        api<{ suggestion: Ai | null }>(`/api/contacts/${c.id}/next-action`, { method: "POST", json: {} }).then((x) => { if (live) setAi(x.suggestion); }).catch(() => undefined);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [c.id, sig]); // eslint-disable-line react-hooks/exhaustive-deps
  if (c.status === "won" || c.status === "lost") return null;
  const aiSig = ai ? `ai:${ai.generatedAt}` : "";
  const aiSnoozed = !!ai && m.snoozes.some((s) => s.contactId === c.id && s.signature === aiSig && s.until > todayStr());
  const top: (NextAction & { ai?: boolean }) | null = ai && !aiSnoozed && ai.kind !== "wait" ? { sig: aiSig, text: ai.action, why: ai.why, kind: ai.kind as ActionKind, urgency: 2, source: "ai", taskTitle: ai.action, ai: true }
    : ai && !aiSnoozed && ai.kind === "wait" && !rules.length ? { sig: aiSig, text: ai.action, why: ai.why, kind: "task", urgency: 1, source: "ai", taskTitle: ai.action, ai: true } : rules[0] || null;
  const others = rules.filter((r) => r.sig !== top?.sig).slice(0, 3);
  const snooze = (a: NextAction, days = 3) => run(() => api("/api/next-actions/snooze", { json: { contactId: c.id, signature: a.sig, days } }), `Snoozed for ${days} days`);
  const task = (a: NextAction) => run(() => api("/api/tasks", { json: { title: a.taskTitle.slice(0, 200), contactId: c.id, dueDate: todayStr(), notes: a.why } }), "Added to your tasks");
  const refresh = async () => { setBusy(true); try { const r = await api<{ suggestion: Ai | null }>(`/api/contacts/${c.id}/next-action?force=1`, { method: "POST", json: {} }); setAi(r.suggestion); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't ask AI", "error"); } finally { setBusy(false); } };
  if (!top) return <div className="nba calm"><span className="nba-ic"><Icon name="check" size={16} /></span><div className="nba-body"><b>Nothing urgent on this lead</b><span className="small muted">No unanswered replies, open requests or overdue follow-ups.</span></div>
    {aiOn && perms.write && <button className="linkbtn small" onClick={refresh} disabled={busy}>{busy ? "Thinking…" : "✦ Ask AI"}</button>}</div>;
  const row = (a: NextAction & { ai?: boolean }, main: boolean) => <div className={"nba" + (main ? "" : " minor") + " u" + a.urgency} key={a.sig}>
    <span className="nba-ic" aria-hidden="true">{a.ai ? "✦" : <Icon name={a.kind === "call" ? "phone" : a.kind === "meeting" ? "calendar" : a.kind === "task" ? "tasks" : a.kind === "note" ? "note" : "mail"} size={16} />}</span>
    <div className="nba-body">{main && <span className="nba-lab">{a.ai ? "Next best action · AI" : "Next best action"}</span>}<b>{a.text}</b><span className="small">{a.why}</span></div>
    {perms.write && <div className="nba-act">
      <button className={"btn sm" + (main ? " primary" : "")} onClick={() => onDo(a.kind)}>{VERB[a.kind]}</button>
      {main && <button className="btn sm" onClick={() => task(a)}>Make it a task</button>}
      <button className="linkbtn small" onClick={() => snooze(a)} title="Hide this for 3 days (it comes back sooner if something changes)">Snooze</button>
    </div>}
  </div>;
  return <AiFold id="lead-nba" title="Next best action"><div className="nba-wrap">
    {row(top, true)}
    {<div className="nba-foot">
      {others.length > 0 && <button className="linkbtn small" onClick={() => setMore(!more)}>{more ? "Hide" : `${others.length} more suggestion${others.length === 1 ? "" : "s"}`}</button>}
      {aiOn && perms.write && <button className="linkbtn small" onClick={refresh} disabled={busy}>{busy ? "Thinking…" : top.ai ? "✦ Ask again" : "✦ Ask AI"}</button>}
      <FoldBtn link />
    </div>}
    {more && others.map((o) => row(o, false))}
  </div></AiFold>;
}
