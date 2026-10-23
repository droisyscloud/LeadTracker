import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { accessFor } from "@/lib/access";

/** Snooze a suggestion for me only. It comes back after the snooze, or sooner if the situation changes. */
export const POST = route(async (req: Request) => {
  const me = await requireUser("viewer");
  const d = await body(req, z.object({ contactId: z.string().uuid(), signature: z.string().min(1).max(200), days: z.number().int().min(1).max(60).default(3) }));
  const acc = await accessFor(me); if (!acc.canSeeContact(d.contactId)) throw new HttpError(404, "Lead not found.");
  const until = new Date(Date.now() + d.days * 86400_000).toLocaleDateString("en-CA");
  await db.insert(schema.actionSnoozes).values({ userId: me.id, contactId: d.contactId, signature: d.signature, until })
    .onConflictDoUpdate({ target: [schema.actionSnoozes.userId, schema.actionSnoozes.contactId, schema.actionSnoozes.signature], set: { until } });
  return ok({ until });
});
