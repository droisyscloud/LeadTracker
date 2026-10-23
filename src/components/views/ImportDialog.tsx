"use client";
import { useMemo, useState } from "react";
import { api, Modal, useData } from "../data";
import { SelectAdd } from "../SelectAdd";

type Field = "ignore" | "name" | "firstName" | "lastName" | "title" | "company" | "email" | "phone" | "website" | "source" | "referredBy"
  | "event" | "team" | "ownerEmail" | "products" | "tags" | "stage" | "nextFollowUp" | "notes";
const FIELDS: [Field, string][] = [
  ["ignore", "Don't import"], ["name", "Full name"], ["firstName", "First name"], ["lastName", "Last name"], ["title", "Job title"], ["company", "Company"],
  ["email", "Email"], ["phone", "Phone"], ["website", "Company website"], ["source", "Source"], ["referredBy", "Introduced by"], ["event", "Event"],
  ["team", "Team"], ["ownerEmail", "Owner email"], ["products", "Products (separated by ;)"], ["tags", "Tags (separated by ;)"], ["stage", "Stage"],
  ["nextFollowUp", "Next follow-up date"], ["notes", "Notes"],
];
const SYN: Record<Exclude<Field, "ignore">, string[]> = {
  name: ["name", "fullname", "contactname", "contact", "leadname"], firstName: ["firstname", "first", "givenname"], lastName: ["lastname", "last", "surname", "familyname"],
  title: ["title", "jobtitle", "position", "designation", "role"], company: ["company", "companyname", "organization", "organisation", "account", "accountname", "business"],
  email: ["email", "emailaddress", "workemail", "mail", "email1"], phone: ["phone", "phonenumber", "mobile", "mobilephone", "telephone", "cell", "contactnumber", "workphone"],
  website: ["website", "companywebsite", "url", "web", "domain", "site"], source: ["source", "leadsource"], referredBy: ["introducedby", "referredby", "referral", "referrer", "introducer"],
  event: ["event", "show", "tradeshow", "conference"], team: ["team"], ownerEmail: ["owneremail", "owner", "assignedto", "salesrep", "rep"],
  products: ["products", "product", "productsofinterest", "interest", "interestedin"], tags: ["tags", "tag", "labels"], stage: ["stage", "status", "leadstatus"],
  nextFollowUp: ["nextfollowup", "followup", "followupdate", "nextfollowupdate", "nextstep"], notes: ["notes", "note", "comments", "comment", "description", "remarks"],
};
const norm = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function guess(header: string): Field {
  const h = norm(header);
  for (const [f, list] of Object.entries(SYN) as [Field, string[]][]) if (list.includes(h)) return f;
  return "ignore";
}

/** RFC 4180 CSV parser: quotes, escaped quotes, commas and line breaks inside quotes, BOM, ; or tab separators. */
function parseCsv(text: string): string[][] {
  const t = text.replace(/^\uFEFF/, "");
  const first = t.split(/\r?\n/, 1)[0] || "";
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? "\t" : ",";
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}
function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return String(v).trim();
}

type Result = { created: number; updated: number; skipped: { row: number | null; name: string; reason: string }[]; warnings: { row: number | null; name: string; message: string }[] };

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { m, perms, reload, toast } = useData();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<string[][] | null>(null);
  const [map, setMap] = useState<Field[]>([]);
  const [err, setErr] = useState("");
  const [dups, setDups] = useState<"skip" | "update">("skip");
  const [owner, setOwner] = useState<"me" | "none" | "column">("me");
  const [eventId, setEventId] = useState("");
  const [teamId, setTeamId] = useState(m.teams.length === 1 ? m.teams[0].id : "");
  const [source, setSource] = useState("Import");
  const [busy, setBusy] = useState(false); const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  async function load(f: File) {
    setErr(""); setResult(null); setFileName(f.name);
    try {
      let data: string[][];
      if (/\.xlsx$/i.test(f.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        const sheet = await readSheet(f, 1);
        data = sheet.map((r) => r.map(cellText)).filter((r) => r.some((c) => c));
      } else if (/\.(csv|txt)$/i.test(f.name)) {
        data = parseCsv(await f.text());
      } else { setErr("Use a .csv or .xlsx file. Older .xls files: open in Excel and save as .xlsx first."); return; }
      if (data.length < 2) { setErr("The file needs a header row and at least one lead."); setRows(null); return; }
      if (data.length > 5001) { setErr("Import up to 5,000 rows at a time. Split the file and import in parts."); setRows(null); return; }
      const width = Math.max(...data.map((r) => r.length));
      const norm = data.map((r) => Array.from({ length: width }, (_, i) => (r[i] ?? "").trim()));
      setRows(norm); setMap(norm[0].map(guess));
    } catch (e) { console.error(e); setErr("This file could not be read. Check it opens in Excel, or download the sample and copy your data into it."); }
  }

  const leads = useMemo(() => {
    if (!rows) return [];
    const col = (f: Field) => map.indexOf(f);
    const get = (r: string[], f: Field) => { const i = col(f); return i >= 0 ? r[i] : ""; };
    const list = (s: string) => s.split(/[;|\n]/).map((x) => x.trim()).filter(Boolean);
    return rows.slice(1).map((r, i) => {
      const name = get(r, "name") || [get(r, "firstName"), get(r, "lastName")].filter(Boolean).join(" ");
      return { row: i + 2, name: name.trim(), title: get(r, "title"), company: get(r, "company"), email: get(r, "email"), phone: get(r, "phone"), website: get(r, "website"),
        source: get(r, "source"), referredBy: get(r, "referredBy"), event: get(r, "event"), team: get(r, "team"), ownerEmail: get(r, "ownerEmail"),
        products: list(get(r, "products")), tags: list(get(r, "tags")), stage: get(r, "stage"), nextFollowUp: get(r, "nextFollowUp"), notes: get(r, "notes") };
    });
  }, [rows, map]);
  const existing = useMemo(() => new Set(m.contacts.map((c) => c.email).filter(Boolean)), [m.contacts]);
  const noName = leads.filter((l) => !l.name).length;
  const badEmail = leads.filter((l) => l.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(l.email)).length;
  const already = leads.filter((l) => l.email && existing.has(l.email.trim().toLowerCase())).length;
  const valid = leads.filter((l) => l.name);
  const hasName = map.includes("name") || map.includes("firstName") || map.includes("lastName");

  async function run() {
    setBusy(true); setProgress(0);
    const total: Result = { created: 0, updated: 0, skipped: leads.filter((l) => !l.name).map((l) => ({ row: l.row, name: "(no name)", reason: "No name" })), warnings: [] };
    try {
      for (let i = 0; i < valid.length; i += 250) {
        const chunk = valid.slice(i, i + 250);
        const r = await api<Result>("/api/contacts/import", { json: { leads: chunk, source: source.trim() || "Import", eventId: eventId || null, teamId: teamId || null, duplicates: dups, owner } });
        total.created += r.created; total.updated += r.updated; total.skipped.push(...r.skipped); total.warnings.push(...r.warnings);
        setProgress(Math.min(valid.length, i + chunk.length));
      }
      setResult(total); await reload(); toast(`${total.created} added${total.updated ? `, ${total.updated} updated` : ""}`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Import failed part-way. Leads already imported are kept; re-run with duplicates set to Skip."); await reload(); }
    setBusy(false);
  }
  function downloadReport() {
    if (!result) return;
    const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = ["Row,Name,Outcome,Detail", ...result.skipped.map((s) => [s.row, s.name, "Skipped", s.reason].map(esc).join(",")), ...result.warnings.map((w) => [w.row, w.name, "Warning", w.message].map(esc).join(","))];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })); a.download = "import-report.csv"; a.click(); URL.revokeObjectURL(a.href);
  }

  return <Modal open onClose={onClose} label="Import contacts">
    <div className="dlg form dlg-wide">
      <header><h2>Import contacts</h2><button className="btn ghost" onClick={onClose}>Close</button></header>
      {!result && <>
        <div className="panel" style={{ padding: 14 }}>
          <b>1. Start from a sample file</b>
          <p className="small muted" style={{ margin: "4px 0 10px" }}>The Excel sample has dropdowns for Stage and Source and a second tab explaining every column. Your own exports from Excel, Google Sheets, HubSpot or a badge scanner also work: you match the columns in step 3.</p>
          <div className="inline"><a className="btn" href="/samples/lead-import-sample.xlsx" download>Download Excel sample (.xlsx)</a><a className="btn" href="/samples/lead-import-sample.csv" download>Download CSV sample (.csv)</a></div>
        </div>
        <label><b style={{ color: "var(--ink)" }}>2. Choose your file</b><input type="file" accept=".csv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
          {fileName && rows && <span className="small muted">{fileName}: {rows.length - 1} rows, {rows[0].length} columns</span>}</label>
        {err && <div className="banner" style={{ margin: 0, borderColor: "var(--cold)" }}>{err}</div>}
        {rows && <>
          <div><b>3. Match your columns</b><p className="small muted" style={{ margin: "2px 0 8px" }}>Columns we recognised are already matched. Change any that are wrong, or set them to "Don't import".</p>
            <div style={{ overflowX: "auto", maxHeight: 260, overflowY: "auto" }}><table className="tbl"><thead><tr><th>Column in your file</th><th>Example</th><th>Import as</th></tr></thead>
              <tbody>{rows[0].map((h, i) => <tr key={i}><td><b>{h || `(column ${i + 1})`}</b></td><td className="small muted" style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rows[1]?.[i]}</td>
                <td><select aria-label={`Import ${h} as`} value={map[i]} onChange={(e) => setMap(map.map((x, j) => (j === i ? (e.target.value as Field) : e.target.value !== "ignore" && x === e.target.value ? "ignore" : x)))} style={{ width: "auto" }}>
                  {FIELDS.map(([f, l]) => <option key={f} value={f}>{l}</option>)}</select></td></tr>)}</tbody></table></div>
          </div>
          <div><b>4. Options</b>
            <div className="two" style={{ marginTop: 8 }}>
              <label>If an email is already in the tracker<select value={dups} onChange={(e) => setDups(e.target.value as "skip" | "update")}><option value="skip">Skip that row</option><option value="update">Update the existing lead with the new details</option></select></label>
              <label>Owner of the new leads<select value={owner} onChange={(e) => setOwner(e.target.value as "me" | "none" | "column")}><option value="me">Me</option><option value="none">Unassigned</option>{perms.manage && <option value="column">From the Owner email column</option>}</select></label>
              <label>Event (for rows without one)<SelectAdd kind="event" value={eventId} onChange={setEventId}><option value="">None</option>{m.events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</SelectAdd></label>
              <label>Team (for rows without one)<SelectAdd kind="team" value={teamId} onChange={setTeamId}><option value="">{m.teams.length ? "Your team, if you have one" : "None"}</option>{m.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</SelectAdd></label>
              <label>Source (for rows without one)<input type="text" value={source} onChange={(e) => setSource(e.target.value)} /></label>
            </div>
          </div>
          <div className="banner" style={{ margin: 0 }}>
            <b>{valid.length} leads ready to import.</b>
            {noName > 0 && ` ${noName} rows have no name and will be skipped.`}
            {badEmail > 0 && ` ${badEmail} rows have an email that doesn't look valid and will be skipped.`}
            {already > 0 && ` ${already} are already in the tracker and will be ${dups === "skip" ? "skipped" : "updated"}.`}
            {!hasName && " Match at least one column to Full name, or First and Last name."}
          </div>
          {valid.length > 0 && <div style={{ overflowX: "auto" }}><table className="tbl"><thead><tr><th>Row</th><th>Name</th><th>Company</th><th>Email</th><th>Products</th></tr></thead>
            <tbody>{valid.slice(0, 5).map((l) => <tr key={l.row}><td className="small muted">{l.row}</td><td>{l.name}</td><td>{l.company}</td><td>{l.email}</td><td className="small">{l.products.join(", ")}</td></tr>)}</tbody></table>
            {valid.length > 5 && <p className="small muted" style={{ margin: "6px 0 0" }}>and {valid.length - 5} more</p>}</div>}
          <div className="btns"><button className="btn primary" disabled={busy || !valid.length || !hasName} onClick={run}>{busy ? `Importing ${progress} of ${valid.length}…` : `Import ${valid.length} leads`}</button><button className="btn ghost" onClick={onClose}>Cancel</button></div>
        </>}
      </>}
      {result && <>
        <div className="kpis" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
          {[["Added", result.created, "var(--warm)"], ["Updated", result.updated, "var(--blue)"], ["Skipped", result.skipped.length, "var(--cold)"]].map(([l, v, c]) =>
            <div key={String(l)} className="panel kpi" style={{ ["--k" as string]: String(c) }}><div className="lab">{l}</div><span className="val">{v}</span></div>)}
        </div>
        {(result.skipped.length > 0 || result.warnings.length > 0) && <>
          <div style={{ maxHeight: 240, overflow: "auto" }}><table className="tbl"><thead><tr><th>Row</th><th>Name</th><th>What happened</th></tr></thead><tbody>
            {result.skipped.map((s, i) => <tr key={`s${i}`}><td className="small muted">{s.row}</td><td>{s.name}</td><td className="small" style={{ color: "var(--cold)" }}>Skipped: {s.reason}</td></tr>)}
            {result.warnings.map((w, i) => <tr key={`w${i}`}><td className="small muted">{w.row}</td><td>{w.name}</td><td className="small" style={{ color: "var(--mild)" }}>Imported, but {w.message}</td></tr>)}
          </tbody></table></div>
          <button className="btn" onClick={downloadReport}>Download this report (.csv)</button></>}
        <div className="btns"><a className="btn primary" href="/contacts?sort=recent" onClick={onClose}>View contacts</a><button className="btn ghost" onClick={() => { setResult(null); setRows(null); setFileName(""); }}>Import another file</button></div>
      </>}
    </div>
  </Modal>;
}
