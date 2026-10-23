import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { QuickAdd } from "@/components/QuickAdd";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quick add" };
/** Phone-first lead capture for events. Works offline once it has been opened online. */
export default async function Page() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (u.role === "viewer") redirect("/home");
  return <QuickAdd />;
}
