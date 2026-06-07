import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { User, type UserRole } from "../modules/auth/auth.model";

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    /** Populated by requireRole after a live DB check. */
    role?: UserRole;
  };
}

export function authenticate(req: AuthRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : req.cookies?.token;

  if (!token) {
    next(new AppError(401, "Authentication required"));
    return;
  }

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch {
    next(new AppError(401, "Invalid or expired token"));
  }
}

/**
 * Authorize a route to one of `roles`. The real security boundary for /admin —
 * never rely on the client guard. Reads role+status straight from the DB so a
 * demotion or ban takes effect immediately (no waiting for the JWT to expire).
 * Admin traffic is low-volume, so the per-request lookup is fine here; the hot
 * authenticate() path stays stateless.
 *
 * Must run after authenticate().
 */
export function requireRole(...roles: UserRole[]) {
  return asyncHandler(async (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError(401, "Authentication required");
    }

    const account = await User.findById(req.user.userId)
      .select("role status")
      .lean();

    if (!account) {
      throw new AppError(401, "Account no longer exists");
    }
    if (account.status === "banned") {
      throw new AppError(403, "This account has been banned");
    }
    if (!roles.includes(account.role)) {
      throw new AppError(403, "You do not have permission to do this");
    }

    req.user.role = account.role;
    next();
  });
}

/** Admin or moderator may view + take most moderation actions. */
export const requireStaff = requireRole("admin", "moderator");

/** Admin only — role changes, hard deletes, etc. */
export const requireAdmin = requireRole("admin");
