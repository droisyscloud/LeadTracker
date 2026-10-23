"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import useSWR from "swr";
import type { Bootstrap } from "@/lib/types";
import { buildModel, can, type Model } from "./model";

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

export async function api<T = unknown>(url: string, opts: { method?: string; json?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method || (opts.json || opts.form ? "POST" : "GET"),
    headers: opts.json ? { "Content-Type": "application/json" } : undefined,
    body: opts.json ? JSON.stringify(opts.json) : opts.form,
    credentials: "same-origin",
  });
  if (res.status === 401) { window.location.href = "/login"; throw new ApiError(401, "Signed out"); }
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, (data && (data as { error?: string }).error) || `Request failed (${res.status})`);
  return data as T;
}

type Ctx = {
  m: Model; reload: () => Promise<unknown>; q: string; setQ: (q: string) => void;
  toast: (msg: string, kind?: ToastKind) => void; perms: { write: boolean; manage: boolean; admin: boolean; export: boolean; del: boolean; money: boolean; billing: boolean };
  run: <T>(fn: () => Promise<T>, okMsg?: string) => Promise<T | undefined>;
};
export type ToastKind = "success" | "error" | "info";
const DataCtx = createContext<Ctx | null>(null);
export const useData = () => { const c = useContext(DataCtx); if (!c) throw new Error("useData outside provider"); return c; };

export function DataProvider({ initial, children }: { initial?: Bootstrap; children: ReactNode }) {
  const { data, mutate, error } = useSWR<Bootstrap>("/api/bootstrap", (u: string) => api<Bootstrap>(u), {
    fallbackData: initial, refreshInterval: 20000, revalidateOnFocus: true,
  });
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ text: string; kind: ToastKind } | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((s: string, kind: ToastKind = "success") => { setMsg({ text: s, kind }); if (t.current) clearTimeout(t.current); t.current = setTimeout(() => setMsg(null), kind === "error" ? 7000 : 3500); }, []);
  const m = useMemo(() => (data ? buildModel(data) : null), [data]);
  // checked only in the browser (after the first render) so the server and browser draw the same page
  const [isOffline, setIsOffline] = useState(false);
  useEffect(() => {
    const sync = () => setIsOffline(navigator.onLine === false);
    sync(); window.addEventListener("online", sync); window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);
  useEffect(() => {
    if (!data) return;
    try { localStorage.setItem("lt-quick-cache", JSON.stringify({ me: { name: data.me.name, email: data.me.email }, products: data.products.map((p) => ({ id: p.id, name: p.name })),
      events: data.events.map((e) => ({ id: e.id, name: e.name, startDate: e.startDate })), companies: data.companies.map((c) => c.name), ai: data.config.ai, savedAt: Date.now() })); } catch { /* storage full or blocked */ }
  }, [data]);
  useEffect(() => { if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => undefined); }, []);
  const run = useCallback(async <T,>(fn: () => Promise<T>, okMsg?: string) => {
    try { const r = await fn(); await mutate(); if (okMsg) toast(okMsg); return r; }
    catch (e) { toast(e instanceof Error ? e.message : "Something went wrong.", "error"); return undefined; }
  }, [mutate, toast]);
  if (!m) {
    const offline = isOffline;
    if (offline || (error && /fetch|network|load failed/i.test(String(error)))) return <div className="main" style={{ padding: 28, display: "grid", gap: 12, maxWidth: 520 }}>
      <h1 style={{ fontSize: "1.4rem", margin: 0 }}>You're offline</h1>
      <p className="muted" style={{ margin: 0 }}>This page needs a connection. You can still add leads and photograph badges in Quick add: they're kept on this device and sent automatically when you're back online.</p>
      <p style={{ margin: 0, display: "flex", gap: 8, flexWrap: "wrap" }}><a className="btn primary" href="/quick">Open Quick add</a><button className="btn" onClick={() => location.reload()}>Try again</button></p>
    </div>;
    return <div className="main"><p className="muted" style={{ padding: 28 }}>{error ? "Could not load data. Refresh the page." : "Loading…"}</p></div>;
  }
  const role = m.me.role;
  const value: Ctx = { m, reload: () => mutate(), q, setQ, toast, run, perms: { write: can(role, "rep"), manage: can(role, "manager"), admin: role === "admin",
    export: m.caps ? m.caps.export : can(role, "manager"), del: m.caps ? m.caps.delete : can(role, "rep"), money: m.caps ? m.caps.money : true, billing: m.caps ? m.caps.billing : true } };
  return <DataCtx.Provider value={value}>{children}<div className={"toast" + (msg ? ` on ${msg.kind}` : "")} role={msg?.kind === "error" ? "alert" : "status"} aria-live={msg?.kind === "error" ? "assertive" : "polite"}>
      {msg && <><span className="toast-ic" aria-hidden="true">{msg.kind === "error" ? "✕" : msg.kind === "info" ? "i" : "✓"}</span><span>{msg.text}</span>
        <button className="toast-x" aria-label="Dismiss" onClick={() => setMsg(null)}>×</button></>}
    </div></DataCtx.Provider>;
}

/** Native <dialog> wrapper. */
/* Back button closes pop-ups: each open pop-up adds a history entry; going back closes the top one instead of leaving the page. */
const backStack: { id: string; close: () => void }[] = []; let ignorePops = 0; let backListening = false;
function listenBack() { if (backListening || typeof window === "undefined") return; backListening = true;
  window.addEventListener("popstate", () => { if (ignorePops > 0) { ignorePops--; return; } const top = backStack.pop(); top?.close(); }); }
export function useBackClose(open: boolean, onClose: () => void) {
  const cb = useRef(onClose); cb.current = onClose; const id = useRef(Math.random().toString(36).slice(2));
  useEffect(() => { if (!open) return; listenBack(); const my = id.current;
    backStack.push({ id: my, close: () => cb.current() });
    // keep the router's own state on the entry, and stay on the same address
    history.pushState({ ...(history.state || {}), oneModal: my }, "", location.href);
    const href = location.href;
    return () => { const i = backStack.findIndex((x) => x.id === my); if (i < 0) return; backStack.splice(i, 1);
      // closed by its own button, Esc or saving: remove the history entry it added, unless it closed because we're going somewhere
      // (saving a new contact opens it, Enter in the jump bar opens a lead): stepping back then would undo that move
      setTimeout(() => { if (location.href === href && history.state?.oneModal === my) { ignorePops++; history.back(); } }, 400); };
  }, [open]);
}
/** The ✕ in the corner of every pop-up. */
export function CloseX({ onClose }: { onClose: () => void }) {
  // only where the window has no Close/Cancel/Done button of its own
  const ref = useRef<HTMLButtonElement>(null); const [hide, setHide] = useState(false);
  useEffect(() => { const t = setTimeout(() => { const box = ref.current?.closest("dialog, .ps-modal, .more-panel, .jump"); if (!box) return;
    setHide([...box.querySelectorAll("button")].some((b) => b !== ref.current && !b.closest(".modal-x") && /^\s*(close|cancel|done)\s*$/i.test(b.textContent || ""))); }, 60); return () => clearTimeout(t); });
  return <button ref={ref} type="button" className="modal-x" hidden={hide} aria-label="Close this window" title="Close (Esc)" onClick={onClose}>✕</button>;
}
export function Modal({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  useBackClose(open, onClose);
  return <dialog ref={ref} aria-label={label} onClose={(e) => { if (e.target === e.currentTarget) onClose(); }} onCancel={(e) => { if (e.target !== e.currentTarget) { e.preventDefault(); return; } onClose(); }}>{open ? <>{children}<CloseX onClose={onClose} /></> : null}</dialog>;
}
/** For the few pop-ups drawn as an overlay rather than a dialog: the same ✕ and back-to-close. */
export function OverlayClose({ onClose }: { onClose: () => void }) { useBackClose(true, onClose); return <CloseX onClose={onClose} />; }
