"use client";
import Link from "next/link";
import { useData } from "./data";
import { SelectAdd } from "./SelectAdd";

/** Pick any number of leads and companies, shown as chips. Picking a lead adds their company too (removable). */
export function LinkPicker({ leadIds, coIds, onChange, linkable }: { leadIds: string[]; coIds: string[]; onChange: (leadIds: string[], coIds: string[]) => void; /** names open their profile (on notes) */ linkable?: boolean }) {
  const { m } = useData();
  const addLead = (id: string) => { if (!id || leadIds.includes(id)) return; const co = m.contactMap.get(id)?.companyId; onChange([...leadIds, id], co && !coIds.includes(co) ? [...coIds, co] : coIds); };
  return <>
    <div className="tk-links"><span className="small muted">Leads {leadIds.length > 0 && `(${leadIds.length})`}</span>
      {leadIds.length > 0 && <div className="chips">{leadIds.map((id) => <span key={id} className="chip" aria-pressed="true">{linkable ? <Link className="chip-open" href={`/contacts?id=${id}`} title="Open their profile">{m.contactMap.get(id)?.name || "Lead"} ↗</Link> : m.contactMap.get(id)?.name || "Lead"}<button type="button" className="linkbtn" aria-label={`Remove ${m.contactMap.get(id)?.name || "lead"}`} onClick={() => onChange(leadIds.filter((y) => y !== id), coIds)}>×</button></span>)}</div>}
      <SelectAdd kind="contact" value="" onChange={addLead} label="Add a lead"><option value="">{leadIds.length ? "+ Add another lead" : "+ Add a lead"}</option>{[...m.contacts].filter((c) => !leadIds.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}{c.companyId ? `, ${m.companyMap.get(c.companyId)?.name || ""}` : ""}</option>)}</SelectAdd></div>
    <div className="tk-links"><span className="small muted">Companies {coIds.length > 0 && `(${coIds.length})`}</span>
      {coIds.length > 0 && <div className="chips">{coIds.map((id) => <span key={id} className="chip" aria-pressed="true">{linkable ? <Link className="chip-open" href={`/companies?id=${id}`} title="Open the company">{m.companyMap.get(id)?.name || "Company"} ↗</Link> : m.companyMap.get(id)?.name || "Company"}<button type="button" className="linkbtn" aria-label={`Remove ${m.companyMap.get(id)?.name || "company"}`} onClick={() => onChange(leadIds, coIds.filter((y) => y !== id))}>×</button></span>)}</div>}
      <SelectAdd kind="company" value="" onChange={(id) => id && !coIds.includes(id) && onChange(leadIds, [...coIds, id])} label="Add a company"><option value="">{coIds.length ? "+ Add another company" : "+ Add a company"}</option>{[...m.companies].filter((c) => !coIds.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectAdd></div>
  </>;
}
