import crypto from "crypto";
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

/** Compare this value between local and VPS /health to confirm the same Server Secret is deployed. */
export function getZegoSecretFingerprint(): string | null {
  if (!isZegoConfigured()) return null;
  return crypto
    .createHash("sha256")
    .update(getZegoServerSecret())
    .digest("hex")
    .slice(0, 8);
}

export function isLikelyWrongZegoSecret(): boolean {
  const secret = getZegoServerSecret();
  const sign = env.ZEGOCLOUD_APP_SIGN.trim();
  return sign.length >= 32 && secret === sign.slice(0, 32);
}

export function logZegoStartupStatus(): void {
  const appId = getZegoAppId();
  if (!appId) {
    console.warn("[zego] ZEGOCLOUD_APP_ID missing — voice calls disabled");
    return;
  }
  if (!isZegoConfigured()) {
    console.warn(
      "[zego] ZEGOCLOUD_SERVER_SECRET must be exactly 32 characters (Server Secret from console, not App Sign)",
    );
    return;
  }
  if (isLikelyWrongZegoSecret()) {
    console.warn(
      "[zego] ZEGOCLOUD_SERVER_SECRET matches the start of ZEGOCLOUD_APP_SIGN — use Server Secret only",
    );
  }
  console.log(
    `[zego] Voice calls enabled (appId=${appId}, secretFingerprint=${getZegoSecretFingerprint()})`,
  );
}
