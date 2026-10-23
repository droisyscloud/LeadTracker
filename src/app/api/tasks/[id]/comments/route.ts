import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor, requireCompany, requireContact, requireDeal, requireTask } from "@/lib/access";
import { deleteFile, putFile } from "@/lib/storage";
import { checkAttachment } from "@/lib/uploads";
import { activeUsers, addWatchers, displayName, loadTask, notify, taskRights, touchTask } from "@/lib/tasks";

export const maxDuration = 120;
const data = z.object({ body: z.string().max(10000).default(""), mentionIds: z.array(z.string().uuid()).max(50).default([]) });

/** Reply on a task: text, @mentions and any number of attachments (images, audio, video, documents). Sent as multipart form data. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("viewer");
  const { id } = await params;
  await requireTask(me, id);
  const { t, watchers } = await loadTask(id);
  if (!taskRights(me, t, watchers).comment) throw new HttpError(403, "You need to be assigned or tagged on this task to reply.");
  const form = await req.formData().catch(() => { throw new HttpError(400, "Send the reply as multipart form data."); });
  const parsed = data.safeParse(JSON.parse(String(form.get("data") || "{}")));
  if (!parsed.success) throw new HttpError(400, "The reply could not be read.");
  const d = parsed.data;
  const files = form.getAll("files").filter((f): f is File => typeof f === "object" && "arrayBuffer" in f);
  if (files.length > 20) throw new HttpError(400, "Attach up to 20 files at a time.");
  const types = files.map(checkAttachment);
  if (!d.body.trim() && !files.length) throw new HttpError(400, "Write something or attach a file.");

  const mentioned = (await activeUsers(d.mentionIds)).map((u) => u.id).filter((x) => x !== me.id);
  const [c] = await db.insert(schema.taskComments).values({ taskId: id, authorId: me.id, kind: "comment", body: d.body.trim(), mentionIds: mentioned }).returning();
  const keys: string[] = [];
  try {
    for (let i = 0; i < files.length; i++) {
      const key = await putFile(Buffer.from(await files[i].arrayBuffer()), types[i]); keys.push(key);
      await db.insert(schema.files).values({ taskCommentId: c.id, name: files[i].name || `attachment-${i + 1}`, contentType: types[i], size: files[i].size, storageKey: key, uploadedById: me.id });
    }
  } catch (e) {
    for (const k of keys) await deleteFile(k).catch(() => undefined);
    await db.delete(schema.taskComments).where(eq(schema.taskComments.id, c.id));
    throw e;
  }
  // replying or being mentioned puts you on the task
  await addWatchers(id, [...mentioned, ...(t.createdById === me.id || t.assigneeId === me.id ? [] : [me.id])].filter((x) => x !== t.assigneeId));
  await touchTask(id);

  const who = displayName(me);
  const preview = d.body.trim().slice(0, 300) + (files.length ? `${d.body.trim() ? "\n" : ""}[${files.length} attachment${files.length > 1 ? "s" : ""}]` : "");
  if (mentioned.length) await notify(mentioned, { kind: "mentioned", taskId: id, actor: me, text: `${who} mentioned you`, email: true, taskTitle: t.title, extra: preview });
  const others = [t.createdById, t.assigneeId, ...watchers].filter((x): x is string => !!x && !mentioned.includes(x));
  await notify(others, { kind: "comment", taskId: id, actor: me, text: `${who} replied`, email: false, taskTitle: t.title, extra: preview });
  return ok({ id: c.id }, 201);
});
