import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPage } from "@/lib/booking";
import { BookingWidget } from "@/components/BookingWidget";
import { company, footerLine } from "@/lib/brand";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const f = await loadPage((await params).slug);
  const us = await company();
  return { title: f ? `${f.page.title} | ${f.user.name || us.name}` : `Booking | ${us.name}`, robots: { index: false, follow: false } };
}

/** Public booking page: no sign-in needed. */
export default async function Page({ params }: P) {
  const { slug } = await params;
  const f = await loadPage(slug);
  if (!f) notFound();
  return <main className="bk-page"><BookingWidget slug={slug} brand={{ name: (await company()).name, footer: footerLine(await company()) }} /></main>;
}
