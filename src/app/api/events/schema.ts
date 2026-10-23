import { z } from "zod";
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
export const eventFields = { name: z.string().trim().min(1).max(200), startDate: day, endDate: day, location: z.string().max(200), cost: z.number().int().min(0), notes: z.string().max(5000) };
