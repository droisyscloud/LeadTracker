import { z } from "zod";
export const reportDef = z.object({
  measure: z.enum(["leads", "deals", "pipeline", "won", "activities", "emails", "calls", "meetings", "received", "tasks"]),
  groupBy: z.enum(["owner", "stage", "month", "quarter", "year", "event", "product", "company", "team", "source", "type", "none"]),
  chart: z.enum(["bar", "line", "donut", "table"]),
  period: z.enum(["all", "this-month", "last-month", "this-quarter", "last-quarter", "this-year", "ytd", "last-year", "ytd-last-year", "custom"]),
  from: z.string().optional(), to: z.string().optional(), owner: z.string().optional(), team: z.string().optional(), product: z.string().optional(), event: z.string().optional(),
});
export const schedule = z.object({ freq: z.enum(["weekly", "monthly"]), weekday: z.number().int().min(0).max(6).default(1), recipients: z.array(z.string().trim().toLowerCase().email()).min(1).max(20), toDrive: z.boolean().default(false) }).nullable();
