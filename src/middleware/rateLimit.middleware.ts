import rateLimit from "express-rate-limit";

/** Global API rate limit — per IP */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Try again later." },
});

/** Stricter limit for auth endpoints */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many auth attempts. Try again later.",
  },
});
