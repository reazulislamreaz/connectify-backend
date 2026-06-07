import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { UserRole } from "../modules/auth/auth.model";

export interface JwtPayload {
  userId: string;
  email: string;
  /** UI hint only — server authorization still re-checks the DB in requireRole. */
  role?: UserRole;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}
