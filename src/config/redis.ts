import Redis from "ioredis";
import { env } from "./env";

let redis: Redis | null = null;

export function needsTls(url: string): boolean {
  return (
    url.startsWith("rediss://") ||
    url.includes(".upstash.io")
  );
}

export function isRedisEnabled(): boolean {
  return env.REDIS_ENABLED && Boolean(env.REDIS_URL);
}

export function createRedisClient(
  options?: { maxRetriesPerRequest?: number | null }
): Redis {
  const url = env.REDIS_URL!;
  return new Redis(url, {
    maxRetriesPerRequest: options?.maxRetriesPerRequest ?? 3,
    lazyConnect: true,
    tls: needsTls(url) ? {} : undefined,
  });
}

/** Connect only if not already connected (safe for tsx watch / duplicate connect calls). */
export async function ensureRedisConnected(client: Redis): Promise<void> {
  const { status } = client;
  if (status === "ready") return;
  if (status === "connect" || status === "connecting") {
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        client.off("ready", onReady);
        client.off("error", onError);
      };
      client.once("ready", onReady);
      client.once("error", onError);
    });
    return;
  }
  await client.connect();
}

export function getRedis(): Redis {
  if (!isRedisEnabled()) {
    throw new Error("Redis is not enabled");
  }
  if (!redis) {
    redis = createRedisClient();
    redis.on("error", (err) => {
      console.error("[redis] connection error:", err.message);
    });
  }
  return redis;
}

export async function connectRedis(): Promise<void> {
  if (!isRedisEnabled()) {
    console.log("[redis] disabled — set REDIS_URL and REDIS_ENABLED=true to enable");
    return;
  }
  try {
    const client = getRedis();
    await ensureRedisConnected(client);
    await client.ping();
    console.log("[redis] connected");
  } catch (err) {
    redis = null;
    const message = err instanceof Error ? err.message : String(err);
    console.error("[redis] connection failed:", message);
    console.error("[redis] caching disabled — fix REDIS_URL in .env and restart");
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
