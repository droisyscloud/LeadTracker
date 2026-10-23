"use client";
import { useState, type ReactNode } from "react";

/** Hover anywhere over a chart's column (a month, a day…) to see its numbers: a guide line and a small box.
 *  Columns are given as positions across the chart, in % of its width (so it works for any SVG or HTML chart). */
export function ChartHover({ n, at, tip, top = 0, bottom = 0, children }: { n: number; at: (i: number) => number; tip: (i: number) => ReactNode; top?: number; bottom?: number; children: ReactNode }) {
  const [i, setI] = useState<number | null>(null);
  const edges = Array.from({ length: n }, (_, k) => { const x = at(k), prev = k ? at(k - 1) : null, next = k < n - 1 ? at(k + 1) : null;
    const l = prev == null ? Math.max(0, x - ((next ?? x + 4) - x) / 2) : (prev + x) / 2, r = next == null ? Math.min(100, x + (x - (prev ?? x - 4)) / 2) : (x + next) / 2; return { x, l, r }; });
  return <div className="chart-hover" onMouseLeave={() => setI(null)}>
    {children}
    <div className="ch-cols" style={{ top: `${top}%`, bottom: `${bottom}%` }}>{edges.map((e, k) => <div key={k} className="ch-col" style={{ left: `${e.l}%`, width: `${Math.max(0.5, e.r - e.l)}%` }} onMouseEnter={() => setI(k)} onFocus={() => setI(k)} tabIndex={-1} />)}</div>
    {i != null && edges[i] && <><div className="ch-guide" style={{ left: `${edges[i].x}%`, top: `${top}%`, bottom: `${bottom}%` }} />
      <div className={"ch-tip" + (edges[i].x > 62 ? " left" : "")} style={{ left: `${edges[i].x}%`, top: `${top}%` }} role="status">{tip(i)}</div></>}
  </div>;
}
