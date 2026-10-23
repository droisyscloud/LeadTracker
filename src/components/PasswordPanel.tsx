"use client";
import { useState } from "react";
import { api, useData } from "./data";
import { Panel } from "./ui";

/** Account → Password: change your own password (email and password sign-in). */
export function PasswordPanel() {
  const { run } = useData();
  const [f, setF] = useState({ current: "", next: "", again: "" });
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setErr(""); };
  async function save() {
    if (f.next.length < 10) { setErr("Use at least 10 characters."); return; }
    if (f.next !== f.again) { setErr("The two new passwords don't match."); return; }
    const r = await run(() => api("/api/me/password", { json: { current: f.current, next: f.next } }), "Password changed");
    if (r) setF({ current: "", next: "", again: "" });
  }
  return <Panel className="s6" title="Password" sub="For signing in with your email and password.">
    <div className="form" style={{ maxWidth: 420 }}>
      <input type="email" autoComplete="username" hidden readOnly />
      <label>Current password<input type="password" autoComplete="current-password" value={f.current} onChange={set("current")} /></label>
      <label>New password<input type="password" autoComplete="new-password" value={f.next} onChange={set("next")} /></label>
      <label>New password again<input type="password" autoComplete="new-password" value={f.again} onChange={set("again")} /></label>
      <p className="small muted" style={{ margin: 0 }}>At least 10 characters. A short sentence you&apos;ll remember works well.</p>
      {err && <p className="small" style={{ margin: 0, color: "var(--cold)" }}>{err}</p>}
      <div className="btns"><button className="btn primary" disabled={!f.next || !f.again} onClick={save}>Change password</button></div>
    </div>
  </Panel>;
}
