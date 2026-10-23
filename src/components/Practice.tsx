"use client";
import { api, useData } from "./data";

/** Shown on every page in the practice space: what it is, try another role, start again. */
export function PracticeBanner() {
  const { m, run, perms } = useData();
  return <div className="practice-banner" role="note">
    <b>Practice space</b><span>Nothing here is real. Emails, notifications, Chat messages and calendar invites are never sent. Sample data comes back fresh every night.</span>
    <label className="pb-role">Try as<select aria-label="Try as" value={m.me.role} onChange={(e) => run(() => api("/api/practice", { method: "PATCH", json: { role: e.target.value } }), "Role changed").then(() => window.location.reload())}>
      <option value="admin">Admin</option><option value="manager">Manager</option><option value="rep">Sales rep</option><option value="viewer">Viewer</option></select></label>
    {perms.admin && <button type="button" className="btn sm" onClick={() => { if (confirm("Start again with fresh sample data? Everything changed in the practice space is replaced. It takes about a minute.")) run(() => api("/api/practice", { json: {} }), "Resetting: refresh in a minute"); }}>Reset now</button>}
  </div>;
}
