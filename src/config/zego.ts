import { env } from "./env";

/** Zego App ID must be numeric in the console; demo strings fall back to 0. */
export function getZegoAppId(): number {
  const parsed = Number(env.ZEGOCLOUD_APP_ID);
  if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  return 0;
}

/**
 * token04 requires the exact 32-character Server Secret from the ZEGOCLOUD console
 * (Project Settings → ServerSecret). Do not use App Sign here.
 */
export function getZegoServerSecret(): string {
  return env.ZEGOCLOUD_SERVER_SECRET.trim();
}

export function isZegoConfigured(): boolean {
  const secret = getZegoServerSecret();
  return getZegoAppId() > 0 && secret.length === 32;
}

export function getZegoServerUrl(): string {
  return env.ZEGOCLOUD_SERVER_URL;
}
