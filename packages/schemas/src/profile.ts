import { z } from "zod";

export const profileEntrySchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  updatedAt: z.number().int(),
});

export type ProfileEntry = z.infer<typeof profileEntrySchema>;

export const profileSchema = z.record(z.string(), z.unknown());
export type Profile = z.infer<typeof profileSchema>;

export const wellKnownProfileKeys = [
  "name",
  "preferredName",
  "dateOfBirth",
  "dosha",
  "bloodType",
  "allergies",
  "dietaryPreferences",
  "location",
  "timezone",
  "goals",
] as const;

export type WellKnownProfileKey = (typeof wellKnownProfileKeys)[number];
