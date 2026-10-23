import { z } from "zod";
export const stepSchema = z.object({ dayOffset: z.number().int().min(0).max(365), subject: z.string().trim().min(1).max(300), body: z.string().trim().min(1).max(20000) });
export const seqFields = { name: z.string().trim().min(1).max(120), steps: z.array(stepSchema).min(1).max(10), active: z.boolean() };
