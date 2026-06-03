/**
 * Verify Zego env locally. Compare secretFingerprint with production /health.
 *
 *   node scripts/zego-check.mjs
 *   curl -sS https://easyconnectify.duckdns.org/health | jq .zego
 */
import crypto from "crypto";
import "dotenv/config";

const appId = Number(process.env.ZEGOCLOUD_APP_ID);
const secret = (process.env.ZEGOCLOUD_SERVER_SECRET || "").trim();
const sign = (process.env.ZEGOCLOUD_APP_SIGN || "").trim();

function fingerprint(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 8);
}

console.log("ZEGOCLOUD_APP_ID:", appId || "(missing)");
console.log("SERVER_SECRET length:", secret.length, secret.length === 32 ? "OK" : "WRONG — need 32 chars");
console.log("APP_SIGN length:", sign.length, sign.length === 64 ? "(64-char App Sign — do not use as Server Secret)" : "");

if (secret.length === 32) {
  console.log("secretFingerprint:", fingerprint(secret));
  console.log("(must match production /health zego.secretFingerprint after VPS deploy)");
}

if (sign.length >= 32 && secret === sign.slice(0, 32)) {
  console.warn("WARNING: SERVER_SECRET equals first 32 chars of APP_SIGN — use Server Secret from console instead.");
}

if (secret.length !== 32) {
  process.exit(1);
}
