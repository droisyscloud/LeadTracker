import { redirect } from "next/navigation";
import { ssoProviderList } from "@/auth";
import { getCurrentUser } from "@/lib/session";
import { getState } from "@/lib/jobstate";
import { appUrl } from "@/lib/config";
import { canManage } from "@/lib/rbac";
import { SettingsView } from "@/components/views/SettingsView";

export const dynamic = "force-dynamic";
export default async function Page() {
  const u = await getCurrentUser();
  if (!u || !canManage(u.role)) redirect("/home");
  const jobs: Record<string, Record<string, unknown>> = {};
  for (const j of ["sync", "sequences", "digests", "crm"]) jobs[j] = ((await getState(`job:${j}`)) as Record<string, unknown>) || {};
  const key = u.role === "admin" ? (process.env.INTAKE_KEYS || "").split(",")[0]?.trim() || null : null;
  return <SettingsView appUrl={appUrl()} intakeKey={key} jobs={jobs} ssoNames={ssoProviderList.map((p) => (p.id === "microsoft-entra-id" ? "Microsoft Entra ID" : p.name))} />;
}
