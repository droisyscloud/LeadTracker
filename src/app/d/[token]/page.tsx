import { PublicDashboard } from "@/components/Reports";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicDashboard token={token} />;
}
