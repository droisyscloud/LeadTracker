import { sql } from "drizzle-orm";
import { db } from "@/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try { await db.execute(sql`select 1`); return Response.json({ ok: true, built: process.env.NEXT_PUBLIC_BUILT_AT || null }); }
  catch { return Response.json({ ok: false }, { status: 503 }); }
}
