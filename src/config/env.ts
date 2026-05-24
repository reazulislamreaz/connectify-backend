import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(5001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CLIENT_URL: z
    .string()
    .min(1)
    .default("http://localhost:3000,http://127.0.0.1:3000"),
  UPLOAD_DIR: z.string().default("uploads"),
  AWS_REGION: z.string().default("us-east-2"),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_BUCKET_NAME: z.string().min(1),
  REDIS_URL: z
    .string()
    .optional()
    .transform((v) => {
      const trimmed = v?.trim();
      return trimmed && trimmed.length > 0 ? trimmed : undefined;
    }),
  REDIS_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  SOCKET_REDIS_ADAPTER: z
    .string()
    .optional()
    .transform((v) => v !== "false" && v !== "0"),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().default(50),
  MONGODB_MIN_POOL_SIZE: z.coerce.number().default(5),
  ZEGOCLOUD_APP_ID: z.string().default("0"),
  ZEGOCLOUD_APP_SIGN: z.string().default(""),
  ZEGOCLOUD_SERVER_SECRET: z.string().default(""),
  ZEGOCLOUD_SERVER_URL: z
    .string()
    .default("wss://webliveroom-api.zego.im/ws"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
