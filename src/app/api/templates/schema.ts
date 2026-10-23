import { z } from "zod";
export const templateFields = { name: z.string().trim().min(1).max(80), subject: z.string().max(300), body: z.string().max(20000), sortOrder: z.number().int().min(0).max(10000) };
