import { z } from "zod";

export const sendRequestSchema = z.object({
  receiverId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid user ID"),
});

export const respondRequestSchema = z.object({
  action: z.enum(["accept", "reject"]),
});
