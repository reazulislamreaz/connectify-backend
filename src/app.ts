import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { env } from "./config/env";
import { cache } from "./cache/cache.service";
import { isRedisEnabled } from "./config/redis";
import { corsOriginValidator } from "./config/cors";
import { errorHandler } from "./middleware/errorHandler";
import { notFoundHandler } from "./middleware/notFoundHandler";
import {
  apiRateLimiter,
  authRateLimiter,
} from "./middleware/rateLimit.middleware";
import authRoutes from "./modules/auth/auth.route";
import userRoutes from "./modules/user/user.route";
import friendRequestRoutes from "./modules/friendRequest/friendRequest.route";
import messageRoutes from "./modules/message/message.route";
import chatRoutes from "./modules/chat/chat.route";
import postRoutes from "./modules/post/post.route";
import callRoutes from "./modules/call/call.route";

const app = express();

// Required behind Next.js/nginx reverse proxy so rate-limit sees real client IPs
// (X-Forwarded-For) instead of throwing ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
app.set("trust proxy", 1);

app.use(
  cors({
    origin: corsOriginValidator,
    credentials: true,
  }),
);
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());
// app.use("/api", apiRateLimiter);
app.use(
  "/uploads",
  express.static(path.resolve(process.cwd(), env.UPLOAD_DIR)),
);

app.get("/health", async (_req, res) => {
  const redisOk = isRedisEnabled() ? await cache.ping() : null;
  res.json({
    success: true,
    message: "Server is running",
    redis: isRedisEnabled() ? (redisOk ? "connected" : "error") : "disabled",
  });
});

app.use("/api/auth", authRateLimiter, authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/friend-requests", friendRequestRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/calls", callRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
