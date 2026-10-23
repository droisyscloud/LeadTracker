import { DocViewer } from "@/components/Content";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ token: string }> }) { const { token } = await params; return <DocViewer token={token} />; }
