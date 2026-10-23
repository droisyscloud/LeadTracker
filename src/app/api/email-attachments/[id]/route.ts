import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor } from "@/lib/access";
import { getFile, putFile } from "@/lib/storage";
import { serveBuffer } from "@/lib/serve";
import { fetchAttachment } from "@/lib/mailsync";
import { canReadEmail } from "@/lib/emailPrivacy";

export const maxDuration = 60;
const MAX = Number(process.env.EMAIL_ATTACHMENT_MAX_MB || 35) * 1024 * 1024;

/** An attachment on a synced email: fetched from the mailbox it came from on first open, then served from storage. */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireUser("viewer");
  const { id } = await params;
  const [a] = await db.select().from(schema.emailAttachments).where(eq(schema.emailAttachments.id, id)).limit(1);
  if (!a) throw new HttpError(404, "Attachment not found.");
  const [owner] = await db.select().from(schema.activities).where(eq(schema.activities.id, a.activityId)).limit(1);
  if (!owner || !(await accessFor(me)).canSeeContact(owner.contactId) || !canReadEmail(owner, me.id)) throw new HttpError(404, "Attachment not found.");
  if (a.storageKey) return serveBuffer(req, await getFile(a.storageKey), a.name, a.contentType);
  if (a.size > MAX) throw new HttpError(413, `This attachment is larger than ${Math.round(MAX / 1048576)} MB. Open it from the original email in Gmail.`);
  const [act] = await db.select().from(schema.activities).where(eq(schema.activities.id, a.activityId)).limit(1);
  if (!act?.mailboxUserId || !act.providerMessageId) throw new HttpError(404, "The original email is not available.");
  const [conn] = await db.select().from(schema.connections).where(eq(schema.connections.userId, act.mailboxUserId)).limit(1);
  if (!conn) throw new HttpError(409, "The person whose mailbox this came from has disconnected it, so the file can't be fetched. Ask them to reconnect.");
  let buf: Buffer;
  try { buf = await fetchAttachment(conn, act.providerMessageId, a.partRef); }
  catch (e) { console.error("attachment fetch failed", e); throw new HttpError(502, "Couldn't fetch the attachment from the mailbox. Try again, or open it in the original email."); }
  const key = await putFile(buf, a.contentType);
  await db.update(schema.emailAttachments).set({ storageKey: key, size: buf.length }).where(eq(schema.emailAttachments.id, id));
  return serveBuffer(req, buf, a.name, a.contentType);
});
