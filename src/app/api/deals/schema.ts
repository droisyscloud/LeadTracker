import { z } from "zod";
export const dealFields = {
  name: z.string().trim().min(1).max(200), notes: z.string().max(10000).optional(), companyId: z.string().uuid().nullable(), contactId: z.string().uuid().nullable(), productId: z.string().uuid().nullable(),
  ownerId: z.string().uuid().nullable(), teamId: z.string().uuid().nullable(), value: z.number().int().min(0).max(2_000_000_000), currency: z.string().length(3),
  stage: z.enum(["qualify", "proposal", "negotiation", "won", "lost"]), probability: z.number().int().min(0).max(100),
  closeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), outcomeReason: z.string().max(80).nullable(), outcomeNote: z.string().max(2000),
};
export const DEFAULT_PROB: Record<string, number> = { qualify: 20, proposal: 50, negotiation: 75, won: 100, lost: 0 };
