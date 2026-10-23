import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
export const dynamic = "force-dynamic";
export default async function Index() {
  const u = await getCurrentUser();
  redirect(u ? "/home" : "/login");
}
