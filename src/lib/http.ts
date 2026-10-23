import { NextResponse } from "next/server";
import type { ZodType } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
/** Data replies are never stored by the browser or anything in between, so a change always shows straight away. */
const NO_STORE = { "Cache-Control": "no-store, private, max-age=0", Pragma: "no-cache" };
export const ok = (data: unknown, init?: number) => NextResponse.json(data, { status: init ?? 200, headers: NO_STORE });
export function fail(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status, headers: NO_STORE });
  console.error(e);
  return NextResponse.json({ error: "Something went wrong on the server." }, { status: 500 });
}
export async function body<T>(req: Request, schema: ZodType<T>, opts?: { patch?: boolean }): Promise<T> {
  let raw: unknown;
  try { raw = await req.json(); } catch { throw new HttpError(400, "Request body must be JSON."); }
  const r = schema.safeParse(raw);
  if (!r.success) throw new HttpError(400, r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  // edits: change only the fields that were sent (a field's default must never overwrite what's saved)
  if (opts?.patch && raw && typeof raw === "object" && !Array.isArray(raw) && r.data && typeof r.data === "object")
    return Object.fromEntries(Object.entries(r.data as Record<string, unknown>).filter(([k]) => k in (raw as Record<string, unknown>))) as T;
  return r.data;
}
/** Wrap a route handler so thrown HttpErrors become JSON responses. */
export function route<A extends unknown[]>(fn: (...a: A) => Promise<Response>) {
  return async (...a: A) => { try { return await fn(...a); } catch (e) { return fail(e); } };
}
