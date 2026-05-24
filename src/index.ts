import http from "http";
import { Server } from "socket.io";
import app from "./app";
import { connectDatabase } from "./config/database";
import { connectRedis, disconnectRedis } from "./config/redis";
import { env } from "./config/env";
import { allowedOrigins } from "./config/cors";
import { setupSocket } from "./socket/socket.handler";
import { attachSocketRedisAdapter, disconnectSocketRedis } from "./config/socketAdapter";

async function bootstrap() {
  await connectDatabase();
  await connectRedis();

  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  await attachSocketRedisAdapter(io);
  setupSocket(io);

  server.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
  });

  const shutdown = async () => {
    await disconnectSocketRedis();
    await disconnectRedis();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
