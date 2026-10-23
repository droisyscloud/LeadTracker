"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ReportsView } from "./views/ReportsView";
import { CustomReports } from "./Reports";
import { TargetsView } from "./Targets";

/** Reports: the overview, the report builder (with saved and scheduled reports), and shareable dashboards. */
export function ReportsTabs() {
  const [tab, setTab] = useState<"overview" | "builder" | "dashboards" | "targets">(() => {
    if (typeof window === "undefined") return "overview";
    const t = new URLSearchParams(window.location.search).get("tab"); return t === "builder" || t === "dashboards" || t === "targets" ? t : "overview";
  });
  const sp = useSearchParams(); const want = sp.get("tab");
  useEffect(() => { setTab(want === "builder" || want === "dashboards" || want === "targets" ? want : "overview"); }, [want]);
  const go = (t: typeof tab) => { setTab(t); const u = new URL(window.location.href); if (t === "overview") u.searchParams.delete("tab"); else u.searchParams.set("tab", t); window.history.replaceState(null, "", u); };
  return <div className="dir">
    <div className="vt rep-tabs" role="tablist" aria-label="Reports">
      {([["overview", "Overview"], ["builder", "Report builder"], ["dashboards", "Dashboards"], ["targets", "Targets"]] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => go(k)}><span>{l}</span></button>)}
    </div>
    {tab === "overview" ? <ReportsView /> : tab === "targets" ? <TargetsView /> : <CustomReports tab={tab} />}
  </div>;
}
