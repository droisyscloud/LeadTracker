import { z } from "zod";
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const projectInput = z.object({ name: z.string().trim().min(1).max(200), companyId: z.string().uuid().nullable().default(null), description: z.string().max(2000).default(""), active: z.boolean().default(true) });
export const expenseInput = z.object({ sowId: z.string().uuid(), type: z.enum(["employee", "contractor", "tools", "travel", "other"]).default("employee"), name: z.string().trim().min(1).max(200),
  calc: z.enum(["one_time", "monthly"]).default("one_time"), planned: z.number().min(0).max(1e9), actual: z.number().min(0).max(1e9).nullable().default(null), currency: z.string().trim().length(3).toUpperCase().default("USD"),
  startDate: day.nullable().default(null), endDate: day.nullable().default(null), active: z.boolean().default(true), notes: z.string().max(2000).default("") });
export const followupInput = z.object({ billingItemId: z.string().uuid(), assigneeId: z.string().uuid().nullable().default(null), type: z.enum(["call", "email", "meeting", "other"]).default("email"),
  priority: z.enum(["high", "normal", "low"]).default("normal"), dueDate: day, status: z.enum(["open", "done"]).default("open"),
  outcome: z.enum(["no_answer", "left_message", "promised", "disputed", "paid", "other", ""]).default(""), notes: z.string().max(4000).default(""), promiseDate: day.nullable().default(null), promiseAmount: z.number().min(0).max(1e9).nullable().default(null) });
