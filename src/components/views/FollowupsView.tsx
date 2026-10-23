"use client";
import { api, useData } from "../data";
import { useState } from "react";
import { Panel } from "../ui";
import { ago, coName, daysSince, dueReason, followDismissed, isDue, isOpen, lastTouch } from "../model";
import { FollowRow } from "../FollowRow";
import type { ContactDTO } from "@/lib/types";

export function FollowupsView() {
  const { m, q, run } = useData(); const [sel, setSel] = useState<Set<string> | null>(null);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s || []); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const removeSel = async () => { if (!sel?.size) return; const n = sel.size; if (!confirm(`Remove the follow-up for ${n} contact${n === 1 ? "" : "s"}? Scheduled dates are cleared too. Set a new date any time to bring someone back.`)) return;
    await run(() => api("/api/contacts/followups/bulk", { json: { ids: [...sel] } }), `${n} follow-up${n === 1 ? "" : "s"} removed`); setSel(null); };
  const qq = q.trim().toLowerCase();
  const cs = m.contacts.filter((c) => !qq || [c.name, coName(m, c), c.email].join(" ").toLowerCase().includes(qq));
  const due = cs.filter((c) => isDue(m, c)).sort((a, b) => (a.nextFollowUp || "0").localeCompare(b.nextFollowUp || "0") || daysSince(m, b) - daysSince(m, a));
  const soon = cs.filter((c) => isOpen(c) && !followDismissed(c) && !isDue(m, c) && c.nextFollowUp).sort((a, b) => a.nextFollowUp!.localeCompare(b.nextFollowUp!));
  const cold = cs.filter((c) => isOpen(c) && !followDismissed(c) && !isDue(m, c) && !c.nextFollowUp && daysSince(m, c) >= 5).sort((a, b) => daysSince(m, b) - daysSince(m, a));
  const L = (list: ContactDTO[], reason: (c: ContactDTO) => string) => list.length ? <ul className="fr-list">{list.map((c) => <FollowRow key={c.id} m={m} c={c} reason={reason(c)} selected={sel?.has(c.id)} onToggle={sel ? () => toggle(c.id) : undefined} />)}</ul> : <p className="empty">Nothing here.</p>;
  return <div className="grid">
    <div className="s12 bulkbar">{sel ? <><b className="small">{sel.size} selected</b>
        <button type="button" className="btn sm" disabled={!sel.size} onClick={removeSel}>Remove follow-up</button>
        <button type="button" className="linkbtn small" onClick={() => setSel(new Set([...due, ...soon, ...cold].map((c) => c.id)))}>Select all</button>
        <button type="button" className="linkbtn small" onClick={() => setSel(null)}>Cancel</button></>
      : <button type="button" className="btn sm ghost" onClick={() => setSel(new Set())}>☐ Select</button>}</div>
    <Panel className="s7" title={`${due.length} due today`} sub="Overdue, due today, or not contacted since the event.">{L(due, (c) => dueReason(m, c))}</Panel>
    <div className="s5" style={{ display: "grid", gap: 16, alignContent: "start" }}>
      <Panel title="Scheduled" sub="Next follow-up date set.">{L(soon, (c) => "Due " + c.nextFollowUp)}</Panel>
      <Panel title="Going cold" sub="No touch in 5 days or more.">{L(cold, (c) => "Last touch " + ago(lastTouch(m, c)))}</Panel>
    </div>
  </div>;
}
