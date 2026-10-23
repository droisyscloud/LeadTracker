"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { api, useData } from "./data";
import { Portal } from "./Portal";
import { AddNoteWindow } from "./Stories";

export type BookPerson = { key: string; name: string; email: string; phone: string; company: string; title: string; source: "google" | "phone"; contactId?: string | null };
const fetcher = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
const PHONE_KEY = "lt-phonebook";
const digits = (s: string) => s.replace(/\D/g, "").slice(-10);

/** the app · Google · Phone, at the top of Contacts. */
export function SourceTabs({ src }: { src: string }) {
  return <div className="src-tabs" role="tablist" aria-label="Which contacts">
    {([["", "Saved"], ["google", "Google"], ["phone", "Phone"]] as const).map(([k, l]) => <Link key={k} role="tab" aria-selected={src === k} className="chip" aria-pressed={src === k} href={k ? `/contacts?src=${k}` : "/contacts"}>{l}</Link>)}
  </div>;
}

/** Read a vCard file (from a phone's Contacts app: Share contact) into people. */
function parseVcf(t: string): BookPerson[] {
  const out: BookPerson[] = [];
  for (const card of t.split(/BEGIN:VCARD/i).slice(1)) {
    const lines = card.replace(/\r?\n[ \t]/g, "").split(/\r?\n/); const get = (k: string) => (lines.find((l) => new RegExp(`^(item\\d+\\.)?${k}[;:]`, "i").test(l)) || "").replace(/^[^:]*:/, "").trim();
    let name = get("FN"); if (!name) { const n = get("N").split(";"); name = [n[1], n[0]].filter(Boolean).join(" "); }
    const email = get("EMAIL").toLowerCase(), phone = get("TEL"), company = get("ORG").split(";")[0] || "", title = get("TITLE");
    if (name || email || phone) out.push({ key: `p:${email || phone || name}`, name: name || email || phone, email, phone, company, title, source: "phone" });
  }
  return out;
}

/** Google or phone contacts: look, add a note, or save someone to the app (only when you choose to). */
export function AddressBook({ source }: { source: "google" | "phone" }) {
  const { m, perms, toast, reload } = useData(); const [q, setQ] = useState(""); const [note, setNote] = useState<BookPerson | null>(null);
  const { data, error, mutate } = useSWR<{ status: string; people: BookPerson[] }>(source === "google" ? "/api/address-book/google" : null, fetcher);
  const [phone, setPhone] = useState<BookPerson[]>([]);
  useEffect(() => { if (source === "phone") try { setPhone(JSON.parse(localStorage.getItem(PHONE_KEY) || "[]")); } catch { setPhone([]); } }, [source]);
  const keepPhone = (add: BookPerson[]) => { const map = new Map(phone.map((p) => [p.key, p])); for (const p of add) map.set(p.key, p); const all = [...map.values()];
    setPhone(all); try { localStorage.setItem(PHONE_KEY, JSON.stringify(all)); } catch { /* storage full */ } toast(`${add.length} ${add.length === 1 ? "person" : "people"} from your phone. They're kept on this device only, not saved to the app.`); };
  const canPick = typeof navigator !== "undefined" && "contacts" in navigator && typeof window !== "undefined" && "ContactsManager" in window;
  const pick = async () => { try {
    const got = await (navigator as unknown as { contacts: { select: (p: string[], o: { multiple: boolean }) => Promise<{ name?: string[]; email?: string[]; tel?: string[] }[]> } }).contacts.select(["name", "email", "tel"], { multiple: true });
    keepPhone(got.map((c) => { const name = c.name?.[0] || "", email = (c.email?.[0] || "").toLowerCase(), tel = c.tel?.[0] || ""; return { key: `p:${email || tel || name}`, name: name || email || tel, email, phone: tel, company: "", title: "", source: "phone" as const }; }).filter((p) => p.name));
  } catch { /* cancelled */ } };
  // who's already in the app (by email or phone number)
  // a phone number only counts when the first name matches too (an office line can be shared by several people)
  const first = (n: string) => n.trim().split(/\s+/)[0]?.toLowerCase() || "";
  const known = useMemo(() => { const e = new Map<string, string>(), t = new Map<string, { id: string; first: string }[]>();
    for (const c of m.contacts) { for (const x of [c.email, ...(c.otherEmails || [])]) if (x) e.set(x.toLowerCase(), c.id);
      for (const x of [c.phone, ...(c.otherPhones || [])]) if (x && digits(x).length >= 7) t.set(digits(x), [...(t.get(digits(x)) || []), { id: c.id, first: first(c.name) }]); }
    return (p: BookPerson) => p.contactId || (p.email && e.get(p.email)) || (p.phone && digits(p.phone).length >= 7 && t.get(digits(p.phone))?.find((x) => x.first === first(p.name))?.id) || null; }, [m.contacts]);
  const people = (source === "google" ? data?.people || [] : phone).filter((p) => { const w = q.toLowerCase().split(/\s+/).filter(Boolean); const hay = `${p.name} ${p.email} ${p.phone} ${p.company} ${p.title}`.toLowerCase(); return w.every((x) => hay.includes(x)); })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const save = async (p: BookPerson) => { if (!confirm(`Save ${p.name} as a contact?`)) return;
    try { await api("/api/contacts", { json: { name: p.name, ...(p.email ? { email: p.email } : {}), ...(p.phone ? { phone: p.phone } : {}), ...(p.company ? { company: p.company } : {}), ...(p.title ? { title: p.title } : {}) } });
      toast(`${p.name} saved as a contact`); reload(); mutate(); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save them.", "error"); } };
  return <div className="abook">
    <p className="small muted" style={{ margin: 0 }}>{source === "google" ? "Your Google contacts, read-only. Nothing here is saved unless you choose to." : "Contacts from your phone, kept on this device only. Nothing is saved unless you choose to."} Add a note about anyone; when you open that note, the app asks if you'd like to save them as a contact.</p>
    {source === "phone" && <div className="btns">
      {canPick && <button type="button" className="btn primary" onClick={pick}>📱 Choose from your phone</button>}
      <label className="btn">📇 Open a contacts file (.vcf)<input type="file" accept=".vcf,text/vcard,text/x-vcard" multiple hidden onChange={async (e) => { const fs = [...(e.target.files || [])]; e.target.value = ""; const all: BookPerson[] = []; for (const f of fs) all.push(...parseVcf(await f.text())); if (all.length) keepPhone(all); else toast("No contacts found in that file.", "error"); }} /></label>
      {phone.length > 0 && <button type="button" className="btn ghost" onClick={() => { if (confirm("Remove these phone contacts from this device? Nothing else changes.")) { localStorage.removeItem(PHONE_KEY); setPhone([]); } }}>Clear</button>}
      {!canPick && <span className="small muted">{/iPhone|iPad/.test(typeof navigator !== "undefined" ? navigator.userAgent : "") ? "iPhone doesn't let apps in the browser open your phonebook. In Contacts, open a contact (or a list), tap Share, and choose this app or save the file, then open it here." : "To bring contacts from a phone: in its Contacts app, share contacts as a file (vCard) and open it here."}</span>}
    </div>}
    {source === "google" && data?.status === "not_connected" && <section className="panel"><p style={{ margin: 0 }}>Connect your Google account to see your Google contacts here.</p><div className="btns"><Link className="btn primary" href="/account">Connect Google</Link></div></section>}
    {source === "google" && data?.status === "reconnect" && <section className="panel"><p style={{ margin: 0 }}><b>One more step:</b> reconnect Google once so the app can read your contacts (read-only). On your Account page, press <b>Connect Google Workspace</b> again and allow contacts.</p><div className="btns"><Link className="btn primary" href="/account">Reconnect Google</Link></div></section>}
    {source === "google" && error && <p className="muted">Couldn't load your Google contacts. Try again in a minute.</p>}
    {(source === "phone" || data?.status === "ok") && <>
      <input type="search" className="abook-q" placeholder={`Search ${source === "google" ? "Google" : "phone"} contacts`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      {source === "google" && !data ? <p className="muted">Loading your Google contacts…</p>
        : !people.length ? <p className="muted">{q ? "No one matches." : source === "phone" ? "No phone contacts on this device yet." : "No Google contacts found."}</p>
        : <ul className="abook-list">{people.slice(0, 400).map((p) => { const cid = known(p); return <li key={p.key}>
          <div className="ab-who"><b>{p.name}</b><span className="small muted">{[p.title, p.company].filter(Boolean).join(" · ")}</span><span className="small">{[p.email, p.phone].filter(Boolean).join(" · ")}</span></div>
          <div className="ab-act">{cid ? <Link className="pill ab-in" href={`/contacts?id=${cid}`}>Open contact ›</Link>
            : <>{perms.write && <button type="button" className="btn sm" onClick={() => setNote(p)}>📝 Note</button>}{perms.write && <button type="button" className="btn sm ghost" onClick={() => save(p)}>＋ Save as contact</button>}</>}</div></li>; })}</ul>}
      {people.length > 400 && <p className="small muted">Showing the first 400. Search to find someone.</p>}</>}
    {note && <Portal><AddNoteWindow person={note} onClose={() => setNote(null)} onSaved={() => setNote(null)} /></Portal>}
  </div>;
}
