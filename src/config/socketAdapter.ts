import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type Redis from "ioredis";
import { env } from "./env";
import {
  createRedisClient,
  ensureRedisConnected,
  isRedisEnabled,
} from "./redis";

let pubClient: Redis | null = null;
let subClient: Redis | null = null;

/**
 * Enables Socket.IO room sync across multiple Node processes (horizontal scaling).
 * Requires REDIS_URL + REDIS_ENABLED=true.
 */
export async function attachSocketRedisAdapter(io: Server): Promise<boolean> {
  if (!isRedisEnabled() || !env.SOCKET_REDIS_ADAPTER) {
    return false;
  }

  await disconnectSocketRedis();

  // lazyConnect + ensureRedisConnected — avoid "already connected" (ioredis auto-connects by default)
  pubClient = createRedisClient({ maxRetriesPerRequest: 3 });
  subClient = createRedisClient({ maxRetriesPerRequest: null });

  pubClient.on("error", (err) => {
    console.error("[socket-redis] pub error:", err.message);
  });
  subClient.on("error", (err) => {
    console.error("[socket-redis] sub error:", err.message);
  });

  await Promise.all([
    ensureRedisConnected(pubClient),
    ensureRedisConnected(subClient),
  ]);

  io.adapter(createAdapter(pubClient, subClient));
  console.log("[socket] Redis adapter attached — multi-instance WebSockets enabled");
  return true;
}

export async function disconnectSocketRedis(): Promise<void> {
  await Promise.all([
    pubClient?.quit().catch(() => {}),
    subClient?.quit().catch(() => {}),
  ]);
  pubClient = null;
  subClient = null;
}
