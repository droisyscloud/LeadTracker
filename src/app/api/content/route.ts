import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { putFile } from "@/lib/storage";

/** The content library with simple stats: links made, opens, total reading time. */
export const GET = route(async () => {
  await requireUser("viewer");
  const docs = await db.select().from(schema.content).orderBy(desc(schema.content.createdAt));
  const links = docs.length ? await db.select().from(schema.contentLinks).where(inArray(schema.contentLinks.contentId, docs.map((d) => d.id))) : [];
  const views = links.length ? await db.select().from(schema.contentViews).where(inArray(schema.contentViews.linkId, links.map((l) => l.id))) : [];
  return ok({ content: docs.map((d) => { const ls = links.filter((l) => l.contentId === d.id); const vs = views.filter((v) => ls.some((l) => l.id === v.linkId));
    const pageTime: Record<string, number> = {}; for (const v of vs) for (const [p, s] of Object.entries(v.pages)) pageTime[p] = (pageTime[p] || 0) + s;
    return { id: d.id, name: d.name, pages: d.pages, kind: d.kind, fileType: d.fileType, fileName: d.fileName, url: d.url, size: d.size, createdById: d.createdById, createdAt: d.createdAt.getTime(), links: ls.length, opens: vs.length,
      seconds: vs.reduce((n, v) => n + v.seconds, 0), pageTime,
      viewers: vs.sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime()).slice(0, 20).map((v) => { const l = ls.find((x) => x.id === v.linkId)!; return { contactId: l.contactId, at: v.lastAt.getTime(), seconds: v.seconds, pagesRead: Object.values(v.pages).filter((s) => s >= 2).length }; }) }; }) });
});
/** Add content: any file (PDF, PowerPoint, Word, Excel, image, video, audio, …) or a web link. */
const MAX = Number(process.env.CONTENT_MAX_UPLOAD_MB || 50) * 1024 * 1024;
const TYPES: Record<string, string> = { pdf: "application/pdf", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ppt: "application/vnd.ms-powerpoint",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", doc: "application/msword", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", csv: "text/csv", txt: "text/plain", zip: "application/zip" };
export const POST = route(async (req: Request) => {
  const me = await requireUser("rep");
  const form = await req.formData().catch(() => { throw new HttpError(400, "Send the content as a file or a link."); });
  const name = String(form.get("name") || "").trim(); const link = String(form.get("url") || "").trim();
  if (link) {
    let u: URL; try { u = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`); } catch { throw new HttpError(400, "That isn't a web address."); }
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) throw new HttpError(400, "That isn't a web address.");
    const [d] = await db.insert(schema.content).values({ name: (name || u.hostname.replace(/^www\./, "")).slice(0, 200), storageKey: "", size: 0, pages: 1, kind: "link", fileType: "text/uri-list", url: u.toString(), createdById: me.id }).returning();
    return ok({ id: d.id, name: d.name, pages: 1, kind: "link" }, 201);
  }
  const f = form.get("file") as File | null;
  if (!f || typeof f !== "object" || !f.size) throw new HttpError(400, "Choose a file to add, or paste a link.");
  if (f.size > MAX) throw new HttpError(413, `The file is larger than ${Math.round(MAX / 1048576)} MB. For big videos, upload them to YouTube, Vimeo or Google Drive and add the link instead.`);
  const ext = (f.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || ""); const type = TYPES[ext] || f.type || "application/octet-stream";
  const buf = Buffer.from(await f.arrayBuffer());
  let pages = 1;
  if (type === "application/pdf") { try { const { getDocumentProxy } = await import("unpdf"); pages = (await getDocumentProxy(new Uint8Array(buf))).numPages || 1; } catch { throw new HttpError(422, "That PDF couldn't be opened."); } }
  const key = await putFile(buf, type);
  const [d] = await db.insert(schema.content).values({ name: (name || f.name.replace(/\.[a-z0-9]+$/i, "")).slice(0, 200), storageKey: key, size: f.size, pages, kind: "file", fileType: type, fileName: f.name.slice(0, 200), createdById: me.id }).returning();
  return ok({ id: d.id, name: d.name, pages: d.pages, kind: "file" }, 201);
});
