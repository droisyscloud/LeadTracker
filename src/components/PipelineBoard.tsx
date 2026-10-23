"use client";
import { useState } from "react";
import type { DealDTO, DealStage } from "@/lib/types";
import { api, useData } from "./data";
import { DEAL_STAGES, moneyShort, userName, dv } from "./model";
import { dealMoney } from "./Payments";

/**
 * Deals as a pipeline: one column per stage with its total, newest close dates first.
 * Drag a card to another column to move the deal; click it to open.
 */
export function PipelineBoard({ deals, onOpen }: { deals: DealDTO[]; onOpen: (d: DealDTO) => void }) {
  const { m, run, perms } = useData();
  const [over, setOver] = useState<string | null>(null); const [drag, setDrag] = useState<string | null>(null);
  const today = new Date().toLocaleDateString("en-CA");
  const canMove = (d: DealDTO) => perms.manage || d.ownerId === m.me.id || d.createdById === m.me.id;
  const move = (id: string, stage: DealStage) => {
    const d = deals.find((x) => x.id === id); if (!d || d.stage === stage || !canMove(d)) return;
    let reason: string | null = null;
    if (stage === "won" || stage === "lost") { reason = window.prompt(stage === "won" ? `Why did we win ${d.name}? (optional)` : `Why was ${d.name} lost? (optional)`, ""); if (reason === null) return; }
    run(() => api(`/api/deals/${id}`, { method: "PATCH", json: { stage, ...(reason ? { outcomeReason: reason } : {}) } }), `${d.name} moved to ${DEAL_STAGES.find((s) => s[0] === stage)?.[1]}`);
  };
  return <div className="pipe" role="list" aria-label="Deal pipeline">
    {DEAL_STAGES.map(([k, label, color]) => {
      const ds = deals.filter((d) => d.stage === k).sort((a, b) => (a.closeDate || "9").localeCompare(b.closeDate || "9"));
      const total = ds.reduce((n, d) => n + dv(d), 0);
      return <section key={k} role="listitem" className={"pipe-col" + (over === k ? " over" : "") + (k === "won" ? " won" : k === "lost" ? " lost" : "")} style={{ ["--c" as string]: color }}
        onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(k); } }} onDragLeave={() => setOver((o) => (o === k ? null : o))}
        onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/deal"); if (id) move(id, k); }}>
        <header><span className="pipe-dot" /><b>{label}</b><span className="pipe-n">{ds.length}</span><span className="pipe-sum num">{moneyShort(total)}</span></header>
        <div className="pipe-cards">
          {ds.map((d) => { const co = d.companyId ? m.companyMap.get(d.companyId)?.name : ""; const late = d.closeDate && d.closeDate < today && k !== "won" && k !== "lost";
            return <article key={d.id} data-sel-id={d.id} className={"pipe-card" + (drag === d.id ? " dragging" : "")} draggable={canMove(d)} tabIndex={0}
              onDragStart={(e) => { e.dataTransfer.setData("text/deal", d.id); e.dataTransfer.effectAllowed = "move"; setDrag(d.id); }} onDragEnd={() => { setDrag(null); setOver(null); }}
              onClick={() => onOpen(d)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(d); }} aria-label={`${d.name}, ${moneyShort(d.value)}`}>
              <div className="pc-top"><b>{d.name}</b><span className="num">{moneyShort(d.value)}</span></div>
              {co && <div className="pc-co">{co}</div>}
              {(() => { const mny = dealMoney(m, d); return (mny.received > 0 || mny.expected > 0) ? <div className="pc-pay" title={`${moneyShort(mny.received)} received, ${moneyShort(mny.pending)} pending`}>
                <span className="pc-paybar"><i style={{ width: `${mny.pct}%` }} /></span><span><b className="won">{moneyShort(mny.received)}</b> received{mny.pending > 0 ? <> · {moneyShort(mny.pending)} pending</> : " · paid in full"}</span>
                {mny.overdue > 0 && <span className="late">{moneyShort(mny.overdue)} overdue</span>}</div> : null; })()}
              <div className="pc-meta"><span>{userName(m, d.ownerId)}</span>{d.closeDate && <span className={late ? "late" : ""}>{late ? "Overdue " : ""}{d.closeDate}</span>}{d.probability ? <span>{d.probability}%</span> : null}</div>
            </article>; })}
          {!ds.length && <div className="pipe-empty">{drag ? "Drop here" : "No deals"}</div>}
        </div>
      </section>; })}
  </div>;
}
