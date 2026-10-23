import { getPreview } from "@/lib/previewLinks";

/** Serves a file for Microsoft's Office viewer, only with a valid 10-minute link. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; name: string }> }) {
  const { token } = await params; const v = getPreview(token);
  if (!v) return new Response("This preview link has expired.", { status: 410 });
  const ext = v.name.toLowerCase().split(".").pop() || "";
  const type = ext === "pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : ext === "ppt" ? "application/vnd.ms-powerpoint" : ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : ext === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : v.type;
  return new Response(new Uint8Array(v.buf), { headers: { "content-type": type, "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(v.name)}`, "cache-control": "private, no-store", "x-robots-tag": "noindex" } });
}
