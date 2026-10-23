"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, useData } from "../data";
import { coName, isOpenDeal, moneyShort, STAGES, webHref, webLabel, type Model, dv } from "../model";
import type { ContactDTO, ProductDTO } from "@/lib/types";
import { AiText } from "../AiText";
import { Icon } from "../ui";
import { DealList } from "../widgets";
import { DirHead, Monogram, useViewMode, ViewToggle } from "../Directory";

const FUNNEL = STAGES.filter((s) => s[0] !== "lost");
const hue = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
const accent = (name: string) => `hsl(${hue(name)} 75% 62%)`;
function stats(m: Model, p: ProductDTO) {
  const leads = m.contacts.filter((c) => c.productIds.includes(p.id));
  const deals = m.deals.filter((d) => d.productId === p.id);
  const open = deals.filter(isOpenDeal).reduce((n, d) => n + dv(d), 0); const won = deals.filter((d) => d.stage === "won").reduce((n, d) => n + dv(d), 0);
  const cos = new Map<string, number>(); for (const c of leads) { const k = coName(m, c); if (k) cos.set(k, (cos.get(k) || 0) + 1); }
  const top = [...cos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  return { leads, deals, open, won, companies: cos.size, top };
}
/** How many interested leads are at each stage. */
function Funnel({ leads, big = false }: { leads: ContactDTO[]; big?: boolean }) {
  const counts = FUNNEL.map((s) => leads.filter((c) => c.status === s[0]).length); const max = Math.max(1, ...counts);
  return <div className={"funnel" + (big ? " big" : "")} role="img" aria-label={FUNNEL.map((s, i) => `${counts[i]} ${s[1]}`).join(", ")}>
    {FUNNEL.map((s, i) => <div key={s[0]} className="fn-step" title={`${counts[i]} ${s[1]}`}>
      <span className="fn-bar"><i style={{ height: `${Math.max(counts[i] ? 8 : 0, (counts[i] / max) * 100)}%`, background: s[2] }} /></span>
      {big ? <><b className="num">{counts[i]}</b><small>{s[1]}</small></> : <small>{counts[i]}</small>}</div>)}
    {!big && <div className="fn-cap"><span>New</span><span>Won</span></div>}
  </div>;
}

export function ProductsView() {
  const { m, run, perms } = useData();
  const sp = useSearchParams(); const router = useRouter();
  const [mode, setMode] = useViewMode("products");
  const [newName, setNewName] = useState(""); const [adding, setAdding] = useState(false);
  const sel = sp.get("id") ? m.productMap.get(sp.get("id")!) : undefined;
  if (sel) return <div className="lead-page"><div className="lead-nav"><Link href="/products" className="btn ghost">← All products</Link></div><ProductPage key={sel.id} p={sel} /></div>;
  const list = [...m.products].map((p) => ({ p, s: stats(m, p) })).sort((a, b) => b.s.leads.length - a.s.leads.length || a.p.name.localeCompare(b.p.name));
  const add = async () => {
    if (!newName.trim()) return;
    const r = await run(() => api<ProductDTO>("/api/products", { json: { name: newName.trim() } }), "Product added");
    if (r) { setNewName(""); setAdding(false); router.push(`/products?id=${r.id}`); }
  };
  return <div className="dir">
    <DirHead count={list.length} noun={list.length === 1 ? "product" : "products"}>
      <ViewToggle value={mode} onChange={setMode} />
      {perms.manage && (adding ? <span className="inline" style={{ gap: 6 }}><input type="text" autoFocus placeholder="New product name" aria-label="New product name" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); if (e.key === "Escape") setAdding(false); }} style={{ width: 200 }} />
        <button className="btn primary" disabled={!newName.trim()} onClick={add}>Add</button><button className="btn ghost" onClick={() => setAdding(false)}>Cancel</button></span>
        : <button className="btn primary" onClick={() => setAdding(true)}>+ New product</button>)}
    </DirHead>
    {!list.length ? <p className="empty dir-empty">Add the products you sell, then tag leads with them.</p>
      : mode === "cards" ? <div className="cards products">{list.map(({ p, s }) =>
        <Link key={p.id} href={`/products?id=${p.id}`} className="pcard" style={{ ["--pc" as string]: accent(p.name) }}>
          <div className="pr-top"><span className="pr-dot" /><b>{p.name}</b></div>
          <p className="pr-desc">{p.description || "No description yet."}</p>
          <div className="pr-nums"><span><b className="num">{s.leads.length}</b><small>interested</small></span><span><b className="num">{s.open ? moneyShort(s.open) : "—"}</b><small>pipeline</small></span><span><b className="num won">{s.won ? moneyShort(s.won) : "—"}</b><small>won</small></span></div>
          <Funnel leads={s.leads} />
          <div className="pr-cos">{s.top.length ? <>Top: {s.top.join(", ")}</> : "No companies yet"}</div>
        </Link>)}</div>
      : <div className="panel tbl-wrap"><table className="tbl dir-tbl"><thead><tr><th>Product</th><th>Interested leads</th><th>Companies</th><th>Open pipeline</th><th>Won</th></tr></thead>
        <tbody>{list.map(({ p, s }) => <tr key={p.id} tabIndex={0} onClick={() => router.push(`/products?id=${p.id}`)} onKeyDown={(e) => { if (e.key === "Enter") router.push(`/products?id=${p.id}`); }}>
          <td><span className="tname"><span className="pr-dot" style={{ ["--pc" as string]: accent(p.name) }} /><span><b>{p.name}</b><small>{p.description}</small></span></span></td>
          <td>{s.leads.length}</td><td>{s.companies}</td><td className="num">{s.open ? moneyShort(s.open) : "—"}</td><td className="num">{s.won ? moneyShort(s.won) : "—"}</td></tr>)}</tbody></table></div>}
  </div>;
}

/** One product: its funnel, who's interested (by company), and its deals. */
function ProductPage({ p }: { p: ProductDTO }) {
  const { m, run, perms } = useData(); const router = useRouter();
  const s = stats(m, p);
  const [edit, setEdit] = useState(false); const [name, setName] = useState(p.name); const [desc, setDesc] = useState(p.description);
  const groups = new Map<string, ContactDTO[]>(); for (const c of s.leads) { const k = coName(m, c) || "No company"; groups.set(k, [...(groups.get(k) || []), c]); }
  return <div className="profile">
    <section className="panel prof-hero" style={{ ["--pc" as string]: accent(p.name) }}>
      <span className="pr-badge"><Icon name="products" size={30} /></span>
      <div className="ph-id"><h2>{p.name}</h2><p>{p.description || "No description yet."}</p></div>
      <div className="ph-act">{perms.manage && <button className="btn" onClick={() => setEdit(!edit)}>{edit ? "Close editing" : "Edit product"}</button>}</div>
      <div className="ph-stats">
        <span><small>Interested leads</small><b className="num">{s.leads.length}</b></span>
        <span><small>Companies</small><b className="num">{s.companies}</b></span>
        <span><small>Open pipeline</small><b className="num">{s.open ? moneyShort(s.open) : "—"}</b></span>
        <span><small>Won</small><b className="num won">{s.won ? moneyShort(s.won) : "—"}</b></span>
      </div>
    </section>
    {edit && perms.manage && <section className="panel form">
      <label>Product name<input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Description<AiText kind="description" rows={2} style={{ minHeight: 60 }} value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
      <div className="btns"><button className="btn primary" onClick={async () => { if (await run(() => api(`/api/products/${p.id}`, { method: "PATCH", json: { name, description: desc } }), "Product saved")) setEdit(false); }}>Save product</button>
        <button className="btn danger" onClick={async () => { if (!confirm(`Delete ${p.name}? It is removed from ${s.leads.length} lead${s.leads.length === 1 ? "" : "s"}.`)) return; const r = await run(() => api(`/api/products/${p.id}`, { method: "DELETE" }), "Product deleted"); if (r) router.push("/products"); }}>Delete product</button></div>
    </section>}
    <section className="panel"><div className="sec-h"><h3>Where interested leads are</h3></div><Funnel leads={s.leads} big /></section>
    <div className="prof-cols">
      <div className="prof-main"><section className="panel"><div className="sec-h"><h3>Interested leads</h3><span className="small muted">{s.leads.length} across {groups.size} compan{groups.size === 1 ? "y" : "ies"}</span></div>
        {s.leads.length ? [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([k, cs]) => { const co = cs[0].companyId ? m.companyMap.get(cs[0].companyId) : undefined;
          return <div key={k} className="pgroup"><div className="pg-h">{co ? <Link className="colink" href={`/companies?id=${co.id}`}><Monogram name={k} size={22} square /> {k}</Link> : <span className="muted">{k}</span>}
            {co?.website && <a className="small muted" href={webHref(co.website)} target="_blank" rel="noopener noreferrer">{webLabel(co.website)}</a>}</div>
            <div className="mini-cards">{cs.map((c) => { const st = STAGES.find((x) => x[0] === c.status)!; return <Link key={c.id} href={`/contacts?id=${c.id}`} className="mcard" style={{ ["--sc" as string]: st[2] }}>
              <Monogram name={c.name} size={32} /><span className="mc-id"><b>{c.name}</b><small>{c.title || "No title"}</small></span><span className="spill">{st[1]}</span></Link>; })}</div></div>; })
          : <p className="empty">Open a contact and tap this product under Products of interest to tag them.</p>}</section></div>
      <aside className="prof-side"><section className="panel"><div className="sec-h"><h3>Deals</h3><span className="small muted">{s.deals.length}</span></div><DealList deals={s.deals} /></section></aside>
    </div>
  </div>;
}
