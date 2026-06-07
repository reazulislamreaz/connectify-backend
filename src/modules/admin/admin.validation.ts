import { z } from "zod";
import { USER_ROLES, ACCOUNT_STATUSES } from "../auth/auth.model";
import { REPORT_TARGET_TYPES } from "./admin.model";

const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(12);
const boolish = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((v) => v === true || v === "true");

export const usersQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(["all", ...ACCOUNT_STATUSES]).default("all"),
  role: z.enum(["all", ...USER_ROLES]).default("all"),
  page,
  limit,
});

export const postsQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  reportedOnly: boolish.optional().default(false),
  page,
  limit,
});

export const reportsQuerySchema = z.object({
  status: z.enum(["all", "open", "resolved", "dismissed"]).default("open"),
  page,
  limit,
});

export const auditQuerySchema = z.object({ page, limit });

export const updateUserSchema = z
  .object({
    status: z.enum(ACCOUNT_STATUSES as [string, ...string[]]).optional(),
    role: z.enum(USER_ROLES as [string, ...string[]]).optional(),
    suspendedUntil: z.coerce.date().optional(),
  })
  .refine((d) => d.status !== undefined || d.role !== undefined, {
    message: "Provide a status or role to update",
  });

export const updatePostSchema = z.object({
  hidden: z.boolean(),
});

export const resolveReportSchema = z.object({
  status: z.enum(["resolved", "dismissed"]),
  action: z.string().trim().max(100).optional(),
});

export const createReportSchema = z.object({
  targetType: z.enum(REPORT_TARGET_TYPES as [string, ...string[]]),
  targetId: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(2).max(200),
  note: z.string().trim().max(1000).optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResolveReportInput = z.infer<typeof resolveReportSchema>;
export type CreateReportInput = z.infer<typeof createReportSchema>;
