import { redirect } from "next/navigation";
// Stories are now called Notes
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) { const q = new URLSearchParams(await searchParams).toString(); redirect(`/notes${q ? `?${q}` : ""}`); }
