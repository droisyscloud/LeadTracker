import { HttpError, ok, route } from "@/lib/http";
import { requireAccountingUser } from "@/lib/collectionsAccess";
import { complete, parseJson } from "@/lib/llm";
import { ingest, type ExtInvoice } from "@/lib/accounting";
import { audit } from "@/lib/audit";

export const maxDuration = 120;
/** Import invoices from any accounting system's export (CSV or Excel): AI maps the columns, then the usual matching runs. */
export const POST = route(async (req: Request) => {
  const me = await requireAccountingUser();
  const form = await req.formData().catch(() => { throw new HttpError(400, "Send the export as a file."); });
  const f = form.get("file"); if (!f || typeof f === "string") throw new HttpError(400, "Choose the export file.");
  const buf = Buffer.from(await f.arrayBuffer()); const ext = f.name.toLowerCase().split(".").pop();
  let rows: string[][] = [];
  if (ext === "xlsx") { const ExcelJS = (await import("exceljs")).default; const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as unknown as ArrayBuffer); const ws = wb.worksheets[0];
    ws.eachRow((r) => rows.push((r.values as unknown[]).slice(1).map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v && typeof v === "object" && "result" in (v as object) ? String((v as { result: unknown }).result) : String(v ?? ""))))); }
  else { const text = buf.toString("utf8"); const delim = (text.split("\n")[0].match(/\t/g) || []).length > (text.split("\n")[0].match(/,/g) || []).length ? "\t" : ",";
    rows = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => { const out: string[] = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === delim && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); }); }
  if (rows.length < 2) throw new HttpError(400, "The file has no rows.");
  const head = rows[0]; const sample = rows.slice(1, 6);
  const map = parseJson<Record<string, number | null>>(await complete({ maxTokens: 400, prompt: `This is an invoice export from an accounting system. Map its columns (0-based index, or null if missing).
Columns: ${JSON.stringify(head)}
Sample rows: ${JSON.stringify(sample)}
Reply ONLY with JSON: {"docNumber": n, "customerName": n, "amount": n, "balance": n, "status": n, "txnDate": n, "dueDate": n, "paidDate": n}
(amount = invoice total; balance = amount still owed; status = a paid/open text column if there is no balance column)` }), "{");
  const at = (r: string[], k: string) => (map[k] != null && map[k]! >= 0 ? r[map[k]!] ?? "" : "");
  const num = (s: string) => Number(String(s).replace(/[^0-9.-]/g, "")) || 0;
  const day = (s: string) => { if (!s) return null; const d = /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : (() => { const t = new Date(s); return isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10); })(); return d; };
  if (map.docNumber == null || map.amount == null) throw new HttpError(422, "Couldn't find the invoice number and amount columns in this file.");
  const list: ExtInvoice[] = rows.slice(1).map((r) => { const amount = num(at(r, "amount")); const status = at(r, "status").toLowerCase();
    const balance = map.balance != null ? num(at(r, "balance")) : /paid|closed/.test(status) && !/unpaid|partial/.test(status) ? 0 : amount;
    return { source: "import" as const, externalId: `${at(r, "docNumber")}|${at(r, "customerName")}`, docNumber: at(r, "docNumber"), customerName: at(r, "customerName"), amount, balance, txnDate: day(at(r, "txnDate")), dueDate: day(at(r, "dueDate")), paidOn: balance <= 0 ? day(at(r, "paidDate")) : null }; })
    .filter((x) => x.docNumber && x.amount);
  const r = await ingest(list); await audit(me.id, "accounting.imported", "settings", null, { file: f.name, ...r });
  return ok({ ...r, columns: map });
});
