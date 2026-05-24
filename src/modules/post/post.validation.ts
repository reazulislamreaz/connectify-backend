import { z } from "zod";

export const createPostSchema = z.object({
  content: z.string().max(5000).trim().optional().default(""),
});

export const feedQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export const updatePostSchema = z.object({
  content: z.string().max(5000).trim().optional(),
  removeImage: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "true"),
});

export const createCommentSchema = z.object({
  content: z.string().min(1).max(2000).trim(),
});

export const updateCommentSchema = z.object({
  content: z.string().min(1).max(2000).trim(),
});

export const commentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(30),
});
