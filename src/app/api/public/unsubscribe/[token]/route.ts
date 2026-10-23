import { NextResponse } from "next/server";
import { readUnsubToken, unsubscribe } from "@/lib/compliance";
import { appUrl } from "@/lib/config";

type Ctx = { params: Promise<{ token: string }> };
/**
 * One-click unsubscribe. Gmail and other inboxes POST "List-Unsubscribe=One-Click" here (RFC 8058);
 * the button on our unsubscribe page posts here too. No sign-in: the signed token identifies the person.
 */
export async function POST(req: Request, { params }: Ctx) {
  const id = readUnsubToken((await params).token);
  if (!id) return NextResponse.json({ error: "This unsubscribe link isn't valid." }, { status: 400 });
  const form = await req.text().catch(() => "");
  await unsubscribe(id, /One-Click/i.test(form) ? "one-click from their inbox" : "unsubscribe link");
  if ((req.headers.get("accept") || "").includes("text/html")) return NextResponse.redirect(`${appUrl()}/u/${(await params).token}?done=1`, 303);
  return NextResponse.json({ unsubscribed: true });
}
// opening the address directly shows the confirmation page (link scanners never unsubscribe anyone)
export async function GET(_req: Request, { params }: Ctx) {
  return NextResponse.redirect(`${appUrl()}/u/${(await params).token}`, 302);
}
