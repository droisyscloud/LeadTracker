import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { vapidKeys } from "@/lib/push";

/** The public key a device needs to turn on notifications, and this person's devices. */
export const GET = route(async () => {
  const me = await requireUser("viewer");
  const subs = await db.select({ id: schema.pushSubscriptions.id, device: schema.pushSubscriptions.device, endpoint: schema.pushSubscriptions.endpoint, createdAt: schema.pushSubscriptions.createdAt, lastSentAt: schema.pushSubscriptions.lastSentAt })
    .from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, me.id));
  return ok({ publicKey: (await vapidKeys()).publicKey, devices: subs.map((s) => ({ id: s.id, device: s.device, endpoint: s.endpoint, createdAt: s.createdAt.getTime(), lastSentAt: s.lastSentAt?.getTime() ?? null })) });
});
/** Turn notifications on for this device. */
export const POST = route(async (req: Request) => {
  const me = await requireUser("viewer");
  const d = await body(req, z.object({ endpoint: z.string().url().max(2000).refine((u) => u.startsWith("https://"), "Push addresses must be secure (https)."), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }), device: z.string().max(120).default("") }));
  await db.insert(schema.pushSubscriptions).values({ userId: me.id, endpoint: d.endpoint, p256dh: d.keys.p256dh, auth: d.keys.auth, device: d.device })
    .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: { userId: me.id, p256dh: d.keys.p256dh, auth: d.keys.auth, device: d.device } });
  return ok({ on: true }, 201);
});
/** Turn them off (one device, or the one with this endpoint). */
export const DELETE = route(async (req: Request) => {
  const me = await requireUser("viewer");
  const u = new URL(req.url); const id = u.searchParams.get("id"); const endpoint = u.searchParams.get("endpoint");
  if (id) await db.delete(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.id, id), eq(schema.pushSubscriptions.userId, me.id)));
  else if (endpoint) await db.delete(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.endpoint, endpoint), eq(schema.pushSubscriptions.userId, me.id)));
  return ok({ off: true });
});
