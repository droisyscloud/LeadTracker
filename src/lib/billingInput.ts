import { z } from "zod";
export const itemFields = z.object({
  label: z.string().trim().min(1).max(200), amount: z.number().nonnegative().max(1e12).default(0), percent: z.number().min(0).max(100).nullable().default(null),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null), trigger: z.string().max(300).default(""), kind: z.enum(["invoice", "renewal"]).default("invoice"),
  // already paid when it's added (for example an advance received before the SOW was attached)
  status: z.enum(["scheduled", "paid"]).default("scheduled"), paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  assigneeId: z.string().uuid().nullable().default(null), watcherIds: z.array(z.string().uuid()).max(20).default([]), autoSend: z.boolean().default(false), note: z.string().max(1000).default(""),
});
