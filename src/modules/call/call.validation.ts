import { z } from "zod";

export const callTokenSchema = z.object({
  roomId: z.string().min(1).max(128),
});
