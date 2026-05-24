import { Response } from "express";
import { AuthRequest } from "../../middleware/auth.middleware";
import { authService } from "./auth.service";
import { asyncHandler } from "../../utils/asyncHandler";
import { env } from "../../config/env";

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export class AuthController {
  register = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name, email, password } = req.body;
    const result = await authService.register(name, email, password);

    res.cookie("token", result.token, cookieOptions);
    res.status(201).json({ success: true, data: result });
  });

  login = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { email, password } = req.body;
    const result = await authService.login(email, password);

    res.cookie("token", result.token, cookieOptions);
    res.json({ success: true, data: result });
  });

  logout = asyncHandler(async (_req: AuthRequest, res: Response) => {
    res.clearCookie("token", cookieOptions);
    res.json({ success: true, message: "Logged out successfully" });
  });

  getMe = asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await authService.getMe(req.user!.userId);
    res.json({ success: true, data: user });
  });

  changePassword = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { currentPassword, newPassword } = req.body;
    const result = await authService.changePassword(
      req.user!.userId,
      currentPassword,
      newPassword
    );
    res.json({ success: true, data: result });
  });

  deleteAccount = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { password } = req.body;
    const result = await authService.deleteAccount(req.user!.userId, password);
    res.clearCookie("token", cookieOptions);
    res.json({ success: true, data: result });
  });
}

export const authController = new AuthController();
