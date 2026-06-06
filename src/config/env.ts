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
  /** Public URL of the frontend — used to build links in emails (e.g. password reset). */
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  // SMTP / email (used for password reset). When unset, emails are skipped (logged in dev).
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .string()
    .optional()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  // Preferred mail credentials (e.g. Google Workspace account + app password).
  // Fall back to SMTP_USER/SMTP_PASS when not set.
  APP_USER_EMAIL: z.string().default(""),
  APP_PASSWORD: z.string().default(""),
  MAIL_FROM: z.string().default(""),
  MAIL_FROM_NAME: z.string().default("Connectify"),
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
  /** When false, mints a general token (empty payload). Use only if room privilege auth is off in Zego console. */
  ZEGO_TOKEN_STRICT: z
    .string()
    .optional()
    .default("true")
    .transform((v) => v !== "false" && v !== "0"),
});

/** Prefer explicit FRONTEND_URL; otherwise first non-localhost origin from CLIENT_URL. */
function resolveFrontendUrl(
  rawFrontend: string | undefined,
  clientUrl: string,
  fallback: string,
): string {
  const explicit = rawFrontend?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const origins = clientUrl
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const production = origins.find(
    (u) => !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(u),
  );
  return (production || origins[0] || fallback).replace(/\/$/, "");
}

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  FRONTEND_URL: resolveFrontendUrl(
    process.env.FRONTEND_URL,
    parsed.data.CLIENT_URL,
    parsed.data.FRONTEND_URL,
  ),
};
