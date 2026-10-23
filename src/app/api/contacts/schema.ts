import { z } from "zod";
export const STAGE = z.enum(["new", "contacted", "engaged", "meeting", "proposal", "won", "lost"]);
export const contactInput = z.object({
  personal: z.boolean().default(false),   // only the person who adds it will ever see it
  name: z.string().trim().min(1, "Name is required").max(200),
  title: z.string().trim().max(200).default(""),
  email: z.string().trim().max(320).default(""),
  otherEmails: z.array(z.string().trim().toLowerCase().email()).max(10).default([]),
  otherPhones: z.array(z.string().trim().max(60)).max(10).default([]),
  linkedinUrl: z.string().trim().max(300).default(""), background: z.string().trim().max(4000).default(""),
  phone: z.string().trim().max(60).default(""),
  company: z.string().trim().max(200).default(""),
  website: z.string().trim().max(300).default(""),
  productIds: z.array(z.string().uuid()).default([]),
  tags: z.array(z.string().max(60)).max(30).default([]),
  source: z.string().max(100).default("Added manually"),
  referredBy: z.string().max(200).default(""),
  eventId: z.string().uuid().nullable().default(null),
  teamId: z.string().uuid().nullable().default(null),
});
export const contactPatch = z.object({
  personal: z.boolean().optional(),
  name: z.string().trim().min(1).max(200), title: z.string().trim().max(200), email: z.string().trim().max(320), otherEmails: z.array(z.string().trim().toLowerCase().email()).max(10), otherPhones: z.array(z.string().trim().max(60)).max(10), followupDismissedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), linkedinUrl: z.string().trim().max(300), background: z.string().trim().max(4000), phone: z.string().trim().max(60),
  company: z.string().trim().max(200), website: z.string().trim().max(300),
  productIds: z.array(z.string().uuid()), tags: z.array(z.string().max(60)).max(30),
  status: STAGE, rating: z.number().int().min(0).max(5), ownerId: z.string().uuid().nullable(),
  nextFollowUp: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  source: z.string().max(100), referredBy: z.string().max(200), eventId: z.string().uuid().nullable(), teamId: z.string().uuid().nullable(),
  outcomeReason: z.string().max(80).nullable(), outcomeNote: z.string().max(2000),
}).partial();
