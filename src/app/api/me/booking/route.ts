import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, HttpError, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { clearAvailability, slugify } from "@/lib/booking";

const input = z.object({
  enabled: z.boolean(), slug: z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes"),
  title: z.string().trim().min(1).max(100), intro: z.string().max(1000),
  durations: z.array(z.number().int().refine((n) => [15, 30, 45, 60, 90].includes(n))).min(1).max(5),
  workdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  startHour: z.number().int().min(0).max(23), endHour: z.number().int().min(1).max(24),
  minNoticeHours: z.number().int().min(0).max(168), daysAhead: z.number().int().min(1).max(90), bufferMin: z.number().int().min(0).max(60), online: z.boolean(),
}).refine((x) => x.endHour > x.startHour, "Working hours must end after they start");

export const PUT = route(async (req: Request) => {
  const me = await requireUser("rep");
  const d = await body(req, input);
  const slug = slugify(d.slug);
  const [clash] = await db.select().from(schema.bookingPages).where(and(eq(schema.bookingPages.slug, slug), ne(schema.bookingPages.userId, me.id))).limit(1);
  if (clash) throw new HttpError(409, "That link is already taken. Try another.");
  const values = { ...d, slug, updatedAt: new Date() };
  await db.insert(schema.bookingPages).values({ userId: me.id, ...values }).onConflictDoUpdate({ target: schema.bookingPages.userId, set: values });
  clearAvailability(me.id);
  return ok({ slug });
});
