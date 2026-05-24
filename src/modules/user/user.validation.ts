import { z } from "zod";

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  address: z.string().max(500).trim().optional(),
  professional: z.string().max(200).trim().optional(),
  religious: z.string().max(100).trim().optional(),
  hobby: z.string().max(300).trim().optional(),
  relationStatus: z.string().max(100).trim().optional(),
  dateOfBirth: z
    .string()
    .optional()
    .refine((val) => !val || !Number.isNaN(Date.parse(val)), {
      message: "Invalid date of birth",
    }),
});

export const searchUsersSchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});
