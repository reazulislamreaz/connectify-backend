import { env } from "./env";

/** Zego App ID must be numeric in the console; demo strings fall back to 0. */
export function getZegoAppId(): number {
  const parsed = Number(env.ZEGOCLOUD_APP_ID);
  if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  return 0;
}

/**
 * token04 requires a 32-character ServerSecret.
 * Demo secrets are padded; replace with your real 32-char secret from the console.
 */
export function getZegoServerSecret(): string {
  const secret = env.ZEGOCLOUD_SERVER_SECRET.trim();
  if (secret.length === 32) return secret;
  return secret.padEnd(32, "0").slice(0, 32);
}

export function getZegoServerUrl(): string {
  return env.ZEGOCLOUD_SERVER_URL;
}
