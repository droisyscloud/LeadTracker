import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor } from "@/lib/access";
import { atLeast } from "@/lib/rbac";
import { deleteFile, putFile } from "@/lib/storage";
import { checkAttachment } from "@/lib/uploads";
import { activeUsers, displayName, notifyLink } from "@/lib/tasks";

export const maxDuration = 120;
const TYPE = z.enum(["contact", "deal", "company"]);
type T = z.infer<typeof TYPE>;

async function canSee(me: { id: string; role: import("@/db/schema").Role }, type: T, id: string) {
  const a = await accessFor(me);
  const ok = type === "contact" ? a.canSeeContact(id) : type === "deal" ? a.canSeeDeal(id) : a.canSeeCompany(id);
  if (!ok) throw new HttpError(404, type === "contact" ? "Lead not found." : type === "deal" ? "Deal not found." : "Company not found.");
}
async function target(type: T, id: string) {
  if (type === "contact") { const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, id)).limit(1); if (!c) throw new HttpError(404, "Lead not found."); return { title: c.name, ownerId: c.ownerId, link: `/contacts?id=${id}` }; }
  if (type === "deal") { const [d] = await db.select().from(schema.deals).where(eq(schema.deals.id, id)).limit(1); if (!d) throw new HttpError(404, "Deal not found."); return { title: d.name, ownerId: d.ownerId, link: `/deals?id=${id}` }; }
  const [c] = await db.select().from(schema.companies).where(eq(schema.companies.id, id)).limit(1); if (!c) throw new HttpError(404, "Company not found."); return { title: c.name, ownerId: null, link: `/companies?id=${id}` };
}

/** The team discussion on a lead, deal or company. */
export const GET = route(async (req: Request) => {
  const me = await requireUser("viewer");
  const u = new URL(req.url);
  const type = TYPE.parse(u.searchParams.get("type")); const id = z.string().uuid().parse(u.searchParams.get("id"));
  await canSee(me, type, id);
  const rows = await db.select().from(schema.comments).where(and(eq(schema.comments.entityType, type), eq(schema.comments.entityId, id))).orderBy(asc(schema.comments.createdAt));
  const files = rows.length ? await db.select().from(schema.files).where(inArray(schema.files.commentId, rows.map((r) => r.id))) : [];
  return ok({ comments: rows.map((c) => ({ id: c.id, kind: "comment", authorId: c.authorId, body: c.body, mentionIds: c.mentionIds, createdAt: c.createdAt.getTime(), editedAt: c.editedAt?.getTime() ?? null,
    files: files.filter((f) => f.commentId === c.id).map((f) => ({ id: f.id, name: f.name, contentType: f.contentType, size: f.size })) })) });
});

const data = z.object({ entityType: TYPE, entityId: z.string().uuid(), body: z.string().max(10000).default(""), mentionIds: z.array(z.string().uuid()).max(50).default([]) });

/** Post to a discussion. Sales reps and above can post; viewers can reply once someone has mentioned them there. */
export const POST = route(async (req: Request) => {
  const me = await requireUser("viewer");
  const form = await req.formData().catch(() => { throw new HttpError(400, "Send the comment as multipart form data."); });
  const parsed = data.safeParse(JSON.parse(String(form.get("data") || "{}")));
  if (!parsed.success) throw new HttpError(400, "The comment could not be read.");
  const d = parsed.data;
  await canSee(me, d.entityType, d.entityId);
  const t = await target(d.entityType, d.entityId);
  const thread = await db.select().from(schema.comments).where(and(eq(schema.comments.entityType, d.entityType), eq(schema.comments.entityId, d.entityId)));
  if (!atLeast(me.role, "rep") && !thread.some((c) => c.mentionIds.includes(me.id))) throw new HttpError(403, "Viewers can reply only after someone mentions them here.");
  const files = form.getAll("files").filter((f): f is File => typeof f === "object" && "arrayBuffer" in f);
  if (files.length > 20) throw new HttpError(400, "Attach up to 20 files at a time.");
  const types = files.map(checkAttachment);
  if (!d.body.trim() && !files.length) throw new HttpError(400, "Write something or attach a file.");
  const mentioned = (await activeUsers(d.mentionIds)).map((u) => u.id).filter((x) => x !== me.id);
  const [c] = await db.insert(schema.comments).values({ entityType: d.entityType, entityId: d.entityId, authorId: me.id, body: d.body.trim(), mentionIds: mentioned }).returning();
  const keys: string[] = [];
  try {
    for (let i = 0; i < files.length; i++) {
      const key = await putFile(Buffer.from(await files[i].arrayBuffer()), types[i]); keys.push(key);
      await db.insert(schema.files).values({ commentId: c.id, name: files[i].name || `attachment-${i + 1}`, contentType: types[i], size: files[i].size, storageKey: key, uploadedById: me.id });
    }
  } catch (e) {
    for (const k of keys) await deleteFile(k).catch(() => undefined);
    await db.delete(schema.comments).where(eq(schema.comments.id, c.id)); throw e;
  }
  const who = displayName(me);
  const preview = d.body.trim().slice(0, 300) + (files.length ? ` [${files.length} attachment${files.length > 1 ? "s" : ""}]` : "");
  if (mentioned.length) await notifyLink(mentioned, { kind: "mentioned", actor: me, text: `${who} mentioned you`, link: t.link, title: t.title, email: true, extra: preview });
  const others = [t.ownerId, ...thread.map((x) => x.authorId)].filter((x): x is string => !!x && !mentioned.includes(x));
  await notifyLink([...new Set(others)], { kind: "comment", actor: me, text: `${who} commented`, link: t.link, title: t.title, extra: preview });
  return ok({ id: c.id }, 201);
});
