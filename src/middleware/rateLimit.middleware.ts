import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import type { Request, RequestHandler } from "express";
import { verifyToken } from "../utils/jwt";
import { getRedis, isRedisEnabled } from "../config/redis";

/**
 * Fail OPEN. If the Redis store is unavailable, the limiter would reject with an
 * error and 500 every /api request. Rate limiting is abuse-prevention, not
 * authentication, so during a Redis blip we log and let the request through
 * rather than take the whole API down.
 */
function failOpen(limiter: RequestHandler): RequestHandler {
  return (req, res, next) => {
    limiter(req, res, (err?: unknown) => {
      if (err) {
        console.error("[rateLimit] store unavailable — allowing request:", err);
      }
      next();
    });
  };
}

/**
 * Shared counter store. The deployment runs multiple backend instances behind
 * nginx, so an in-process store would let each instance keep its own count
 * (effective limit ≈ N×). A Redis-backed store makes the limit global. Falls
 * back to the default in-memory store for single-instance/dev (no Redis).
 * getRedis() is resolved lazily per request, after the client has connected.
 */
function makeStore(prefix: string) {
  if (!isRedisEnabled()) return undefined;
  return new RedisStore({
    prefix,
    sendCommand: (command: string, ...args: string[]) =>
      getRedis().call(command, ...args) as Promise<never>,
  });
}

/**
 * Why we key by user/email instead of IP:
 * REST is proxied Browser → Vercel → Cloudflare → nginx → Express, so the client
 * IP the origin can see collapses to a handful of Vercel egress IPs. No
 * `trust proxy` value recovers the real browser IP for proxied requests, so
 * IP-keyed limits would dump every user into one shared bucket. Identity-based
 * keys avoid that entirely and are fairer (10 tabs = one user).
 */

/** Authenticated user id from the JWT, else a proxy-safe, IPv6-normalized IP. */
function userOrIpKey(req: Request): string {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ")
    ? header.slice(7)
    : (req as Request & { cookies?: { token?: string } }).cookies?.token;
  if (token) {
    try {
      return `user:${verifyToken(token).userId}`;
    } catch {
      // invalid/expired → treat as anonymous, fall through to IP
    }
  }
  return `ip:${ipKeyGenerator(req.ip ?? "")}`;
}

/** Target email (for credential endpoints), else IP. Throttles brute force
 * against a single account regardless of source IP. */
function emailOrIpKey(req: Request): string {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.toLowerCase().trim()
      : undefined;
  return email ? `email:${email}` : `ip:${ipKeyGenerator(req.ip ?? "")}`;
}

/**
 * Global limiter — per authenticated user (or per IP when logged out).
 * Generous ceiling: this is an abuse backstop, not a tight quota. Comfortably
 * above the admin dashboard's polling plus heavy browsing.
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  store: makeStore("rl:api:"),
  message: { success: false, message: "Too many requests. Please slow down." },
});
export const apiRateLimiter = failOpen(apiLimiter);

/**
 * Strict limiter for credential endpoints (login / register / forgot / reset).
 * Keyed by email so brute force against one account is bounded even though the
 * origin can't see real client IPs. Apply per-route — NOT to all of /api/auth,
 * since /auth/me is hit constantly.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: emailOrIpKey,
  store: makeStore("rl:auth:"),
  message: {
    success: false,
    message: "Too many attempts. Please try again in a few minutes.",
  },
});
export const authRateLimiter = failOpen(authLimiter);
