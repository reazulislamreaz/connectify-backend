import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { env } from "./config/env";
import { cache } from "./cache/cache.service";
import { isRedisEnabled } from "./config/redis";
import { corsOriginValidator } from "./config/cors";
import { isZegoConfigured } from "./config/zego";
import { getMailHealth } from "./services/mail.service";
import { errorHandler } from "./middleware/errorHandler";
import { notFoundHandler } from "./middleware/notFoundHandler";
import { apiRateLimiter } from "./middleware/rateLimit.middleware";
import authRoutes from "./modules/auth/auth.route";
import userRoutes from "./modules/user/user.route";
import friendRequestRoutes from "./modules/friendRequest/friendRequest.route";
import messageRoutes from "./modules/message/message.route";
import chatRoutes from "./modules/chat/chat.route";
import postRoutes from "./modules/post/post.route";
import callRoutes from "./modules/call/call.route";
import adminRoutes from "./modules/admin/admin.route";
import reportRoutes from "./modules/admin/report.route";

const app = express();

// Required behind Next.js/nginx reverse proxy so rate-limit sees real client IPs
// (X-Forwarded-For) instead of throwing ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
app.set("trust proxy", 1);

// Middleware order: helmet → rate limit → routes.
// API-only backend (frontend is on Vercel), so CSP is disabled.
app.use(helmet({ contentSecurityPolicy: false }));

app.use(
  cors({
    origin: corsOriginValidator,
    credentials: true,
  }),
);
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());
app.use(
  "/uploads",
  express.static(path.resolve(process.cwd(), env.UPLOAD_DIR)),
);

// Global limiter for all of /api, keyed per user (or per IP when logged out).
// The stricter, email-keyed auth limiter is applied per-route in auth.route.ts
// so it doesn't throttle hot authenticated endpoints like /auth/me.
app.use("/api", apiRateLimiter);

app.get("/health", async (_req, res) => {
  const redisOk = isRedisEnabled() ? await cache.ping() : null;
  const mail = getMailHealth();
  res.json({
    success: true,
    message: "Server is running",
    redis: isRedisEnabled() ? (redisOk ? "connected" : "error") : "disabled",
    mail,
    // Public endpoint — expose only whether calls are configured, not the
    // appId or secret fingerprint.
    zego: { configured: isZegoConfigured() },
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/friend-requests", friendRequestRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/calls", callRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/reports", reportRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
