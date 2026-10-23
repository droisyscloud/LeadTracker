import type { Role } from "@/db/schema";

const RANK: Record<Role, number> = { viewer: 0, rep: 1, manager: 2, admin: 3 };

export const ROLE_INFO: Record<Role, { label: string; can: string[] }> = {
  admin: { label: "Admin", can: ["Sees and changes everything", "Invites people, sets roles and teams, disables access", "Sees the audit log"] },
  manager: { label: "Manager", can: ["Sees everything in their teams", "Sees unassigned leads and hands them out", "Reassigns, merges, deletes and exports within their teams"] },
  rep: { label: "Sales rep", can: ["Sees only leads they own, plus leads shared with them", "Works their own leads: email, calls, notes, deals, tasks", "No access to team pages"] },
  viewer: { label: "Viewer", can: ["Sees only leads assigned to them", "Read-only; can reply when mentioned"] },
};

export function atLeast(role: Role, min: Role) { return RANK[role] >= RANK[min]; }
export const canWrite = (r: Role) => atLeast(r, "rep");
export const canManage = (r: Role) => atLeast(r, "manager");
export const canAdmin = (r: Role) => r === "admin";
