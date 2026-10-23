import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getFile } from "@/lib/storage";

export const dynamic = "force-dynamic";
/** The document behind a tracked link (meta with ?meta=1, otherwise the PDF itself). */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [link] = await db.select().from(schema.contentLinks).where(eq(schema.contentLinks.token, token)).limit(1);
  const [doc] = link ? await db.select().from(schema.content).where(eq(schema.content.id, link.contentId)).limit(1) : [];
  if (!doc) return Response.json({ error: "This link isn't available." }, { status: 404 });
  if (new URL(req.url).searchParams.get("meta")) return Response.json({ name: doc.name, pages: doc.pages, kind: doc.kind, fileType: doc.fileType, fileName: doc.fileName, url: doc.kind === "link" ? doc.url : "" });
  if (doc.kind === "link" || !doc.storageKey) return Response.json({ error: "This is a link, not a file." }, { status: 404 });
  const buf = await getFile(doc.storageKey); const fname = doc.fileName || `${doc.name}.pdf`;
  return new Response(new Uint8Array(buf), { headers: { "content-type": doc.fileType || "application/pdf", "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(fname)}`, "cache-control": "private, max-age=300", "x-robots-tag": "noindex", "x-content-type-options": "nosniff" } });
}
