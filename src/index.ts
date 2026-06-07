import http from "http";
import { Server } from "socket.io";
import app from "./app";
import { connectDatabase } from "./config/database";
import { connectRedis, disconnectRedis } from "./config/redis";
import { env } from "./config/env";
import { allowedOrigins } from "./config/cors";
import { setupSocket } from "./socket/socket.handler";
import { attachSocketRedisAdapter, disconnectSocketRedis } from "./config/socketAdapter";
import { logZegoStartupStatus } from "./config/zego";
import { logMailStartupStatus } from "./services/mail.service";

async function bootstrap() {
  await connectDatabase();
  await connectRedis();
  logZegoStartupStatus();
  logMailStartupStatus();

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

}

let shuttingDown = false;
async function shutdown(code = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await disconnectSocketRedis();
    await disconnectRedis();
  } catch (err) {
    console.error("Error during shutdown:", err);
  } finally {
    process.exit(code);
  }
}

process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));

// A stray rejection (e.g. a throw inside an async socket handler) is logged,
// never fatal — one bad event must not take down the whole worker. Without this,
// Node 20 terminates the process on any unhandled rejection.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

// An unexpected synchronous throw means state may be corrupt — exit cleanly and
// let PM2 restart a fresh worker rather than continue in an unknown state.
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  void shutdown(1);
});

bootstrap().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
