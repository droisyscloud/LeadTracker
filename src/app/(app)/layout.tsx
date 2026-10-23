import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { getCurrentUser } from "@/lib/session";
import { DataProvider } from "@/components/data";
import { Shell } from "@/components/Shell";

export const dynamic = "force-dynamic";

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/login?signedout=1" });
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <DataProvider><Shell signOutAction={signOutAction}>{children}</Shell></DataProvider>;
}
