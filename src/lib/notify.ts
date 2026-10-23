import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { pushTo } from "./push";
import { appName } from "./brand";

type Row = typeof schema.notifications.$inferInsert;
const TITLE: Record<string, string> = {
  assigned: "New task for you", tagged: "You were tagged", mentioned: "You were mentioned", comment: "New reply", status: "Task updated",
  due: "Due tomorrow", overdue: "Overdue", task: "Task", booking: "New booking", reply: "A lead replied", unsubscribed: "Unsubscribed", content: "Document opened",
};
/** Save notifications for the bell and send them to people's phones. Use this instead of inserting directly. */
export async function addNotifications(rows: Row[]) {
  if (!rows.length) return;
  await db.insert(schema.notifications).values(rows);
  // task notifications say which task
  const taskIds = [...new Set(rows.map((r) => r.taskId).filter(Boolean) as string[])];
  const titles = new Map(taskIds.length ? (await db.select({ id: schema.tasks.id, title: schema.tasks.title }).from(schema.tasks).where(inArray(schema.tasks.id, taskIds))).map((t) => [t.id, t.title]) : []);
  for (const r of rows) {
    const url = r.link || (r.taskId ? `/tasks?id=${r.taskId}` : "/home");
    const t = r.taskId ? titles.get(r.taskId) : undefined;
    pushTo([r.userId], { title: TITLE[r.kind] || appName(), body: t && !r.text.includes(t) ? `${t}: ${r.text}` : r.text, url, tag: `${r.kind}-${r.taskId || r.link || ""}` }).catch((e) => console.error("push", e));
  }
}
