import { z } from "zod";
export const teamFields = {
  name: z.string().trim().min(1).max(80), description: z.string().max(500), notes: z.string().max(10000), color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  leadId: z.string().uuid().nullable(), target: z.number().int().min(0).max(2_000_000_000),
  memberIds: z.array(z.string().uuid()).max(500), productIds: z.array(z.string().uuid()).max(200),
};
