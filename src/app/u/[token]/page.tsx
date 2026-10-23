import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { readUnsubToken } from "@/lib/compliance";
import { company, footerLine } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Email preferences", robots: { index: false, follow: false } };
const mask = (e: string) => e.replace(/^(.)(.*)(@.*)$/, (_m, a: string, b: string, c: string) => a + "•".repeat(Math.min(6, b.length)) + c);

/** Public unsubscribe page. A button press (not just opening the link) unsubscribes, so link scanners can't. */
export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params; const { done } = await searchParams;
  const id = readUnsubToken(token);
  const us = await company();
  const [c] = id ? await db.select().from(schema.contacts).where(eq(schema.contacts.id, id)).limit(1) : [];
  return <main className="bk-page"><div className="bk-card" style={{ maxWidth: 520 }}>
    <header className="bk-head" style={{ gridTemplateColumns: "1fr auto" }}><h1>Email preferences</h1><img className="bk-logo" src="/api/public/brand/mark" alt={us.name} width={28} height={28} /></header>
    {!c ? <p>This link isn't valid any more. If you'd like to stop emails from {us.name}, reply to any of our emails with "unsubscribe".</p>
      : c.unsubscribedAt || done ? <><p><b>You're unsubscribed.</b> {c.email ? mask(c.email) : "This address"} won't receive any more follow-up emails from {us.name}.</p>
          <p className="bk-muted">Changed your mind? Reply to any of our emails and we'll add you back.</p></>
      : <form method="post" action={`/api/public/unsubscribe/${token}`} style={{ display: "grid", gap: 14 }}>
          <p>Stop follow-up emails from {us.name} to <b>{c.email ? mask(c.email) : "this address"}</b>?</p>
          <button className="bk-btn" type="submit">Unsubscribe</button>
        </form>}
    <footer className="bk-foot">{footerLine(us)}</footer>
  </div></main>;
}
