/** Send a stored file to the browser: inline for things browsers display safely, download for the rest, with byte ranges for audio and video. */
const INLINE = /^(image\/(png|jpeg|gif|webp)|application\/pdf|audio\/[\w.+-]+|video\/(mp4|webm|quicktime))$/;
export function serveBuffer(req: Request, buf: Buffer, name: string, contentType: string): Response {
  const download = new URL(req.url).searchParams.get("download") === "1";
  const base: Record<string, string> = {
    "Content-Type": INLINE.test(contentType) || contentType.startsWith("text/") ? contentType : "application/octet-stream",
    "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600",
    "Content-Disposition": `${INLINE.test(contentType) && !download ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
  };
  if (contentType.startsWith("text/")) base["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(name)}`;
  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range) {
    const size = buf.length;
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start); end = Math.min(size - 1, end);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${size}` } });
    const part = buf.subarray(start, end + 1);
    return new Response(new Uint8Array(part), { status: 206, headers: { ...base, "Content-Length": String(part.length), "Content-Range": `bytes ${start}-${end}/${size}` } });
  }
  return new Response(new Uint8Array(buf), { headers: { ...base, "Content-Length": String(buf.length) } });
}
