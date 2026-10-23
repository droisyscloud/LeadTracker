"use client";
import { useEffect, useState } from "react";
import { api, useData } from "./data";
import { Panel } from "./ui";

type Cap = "export" | "delete" | "money" | "billing"; type R = "manager" | "rep" | "viewer";
type Settings = Record<R, Record<Cap, boolean>>;
/** Admins choose, per role, who can export, delete, see deal values and money, and see billing. */
export function PermissionsPanel() {
  const { run, perms } = useData();
  const [caps, setCaps] = useState<[Cap, string, string][]>([]); const [s, setS] = useState<Settings | null>(null);
  useEffect(() => { if (perms.admin) api<{ caps: [Cap, string, string][]; settings: Settings }>("/api/admin/permissions").then((r) => { setCaps(r.caps); setS(r.settings); }).catch(() => undefined); }, [perms.admin]);
  if (!perms.admin || !s) return null;
  const roles: [R, string][] = [["manager", "Manager"], ["rep", "Sales rep"], ["viewer", "Viewer"]];
  return <Panel className="s12" title="Permissions" sub="What each role may do, on top of what their role already allows. Admins can always do everything.">
    <div className="tbl-wrap"><table className="tbl perm-tbl"><thead><tr><th>Ability</th>{roles.map(([k, l]) => <th key={k} className="n">{l}</th>)}</tr></thead>
      <tbody>{caps.map(([c, label, help]) => <tr key={c}><td><b>{label}</b><div className="small muted">{help}</div></td>
        {roles.map(([r]) => <td key={r} className="n"><input type="checkbox" aria-label={`${label}: ${r}`} checked={s[r][c]} onChange={(e) => setS({ ...s, [r]: { ...s[r], [c]: e.target.checked } })} style={{ width: 20, height: 20 }} /></td>)}</tr>)}</tbody></table></div>
    <div className="btns"><button className="btn primary" onClick={() => run(() => api("/api/admin/permissions", { method: "PUT", json: s }), "Permissions saved")}>Save permissions</button>
      <span className="small muted">Changes apply the next time each person's screen refreshes.</span></div>
  </Panel>;
}
