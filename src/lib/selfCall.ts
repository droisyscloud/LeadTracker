/**
 * Run one of the app's own API handlers directly, in the same request (same signed-in person, same rules),
 * instead of sending a web request back to the app. Works on any host: no network, proxies or redirects involved.
 */
type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
export async function callRoute(handler: unknown, base: Request, method: string, opts: { json?: unknown; form?: FormData; params?: Record<string, string> } = {}) {
  const headers = new Headers(); const ck = base.headers.get("cookie"); if (ck) headers.set("cookie", ck);
  let body: BodyInit | undefined;
  if (opts.json !== undefined) { headers.set("content-type", "application/json"); body = JSON.stringify(opts.json); } else if (opts.form) body = opts.form;
  const res = await (handler as Handler)(new Request(new URL("/internal", base.url), { method, headers, body }), { params: Promise.resolve(opts.params || {}) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: data as Record<string, unknown> & { error?: string } };
}
