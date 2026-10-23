"use client";
import { useEffect, useState } from "react";
import { useData } from "./data";

const read = () => (typeof document !== "undefined" && /(?:^|; )lt-scope=mine/.test(document.cookie) ? "mine" : "all");
const set = (v: "mine" | "all") => { document.cookie = `lt-scope=${v}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`; location.reload(); };

/** Admins: see only their own work, or everything. The whole app (menus, lists, numbers) follows it. */
export function ScopeToggle() {
  const { m } = useData(); const [v, setV] = useState<"mine" | "all">("all"); useEffect(() => setV(read()), []);
  if (!m.canScope) return null;
  return <div className="scope-tg" role="group" aria-label="What you're seeing"><span className="small muted">Showing</span>
    <button type="button" className="chip" aria-pressed={v === "mine"} onClick={() => v !== "mine" && set("mine")}>👤 Only mine</button>
    <button type="button" className="chip" aria-pressed={v === "all"} onClick={() => v !== "all" && set("all")}>🌐 Everything</button></div>;
}
/** In the top bar on every page while "Only mine" is on, so it's never forgotten; tap to see everything again. */
export function ScopePill() {
  const { m } = useData(); const [v, setV] = useState<"mine" | "all">("all"); useEffect(() => setV(read()), []);
  if (!m.canScope || v !== "mine") return null;
  return <button type="button" className="pill scope-pill" title="You're seeing only your own work. Tap to see everything." onClick={() => set("all")}>👤 Only mine ✕</button>;
}
