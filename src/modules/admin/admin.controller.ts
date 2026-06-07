import { Response } from "express";
import { AuthRequest } from "../../middleware/auth.middleware";
import { adminService } from "./admin.service";
import { asyncHandler } from "../../utils/asyncHandler";
import { getParamId } from "../../utils/params";
import type { UserRole, AccountStatus } from "../auth/auth.model";

function actorOf(req: AuthRequest) {
  return { id: req.user!.userId, role: req.user!.role ?? "user" };
}

export class AdminController {
  getStats = asyncHandler(async (_req: AuthRequest, res: Response) => {
    res.json({ success: true, data: await adminService.getStats() });
  });

  getHealth = asyncHandler(async (_req: AuthRequest, res: Response) => {
    res.json({ success: true, data: await adminService.getHealth() });
  });

  listUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
    const q = req.query as unknown as {
      search?: string;
      status: AccountStatus | "all";
      role: UserRole | "all";
      page: number;
      limit: number;
    };
    res.json({ success: true, data: await adminService.listUsers(q) });
  });

  updateUser = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await adminService.updateUser(
      actorOf(req),
      getParamId(req.params.id),
      req.body,
    );
    res.json({ success: true, data });
  });

  forceLogout = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await adminService.forceLogout(
      actorOf(req),
      getParamId(req.params.id),
    );
    res.json({ success: true, data });
  });

  listPosts = asyncHandler(async (req: AuthRequest, res: Response) => {
    const q = req.query as unknown as {
      search?: string;
      reportedOnly: boolean;
      page: number;
      limit: number;
    };
    res.json({ success: true, data: await adminService.listPosts(q) });
  });

  updatePost = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await adminService.setPostHidden(
      actorOf(req),
      getParamId(req.params.id),
      req.body.hidden,
    );
    res.json({ success: true, data });
  });

  deletePost = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await adminService.deletePost(
      actorOf(req),
      getParamId(req.params.id),
    );
    res.json({ success: true, data });
  });

  listReports = asyncHandler(async (req: AuthRequest, res: Response) => {
    const q = req.query as unknown as {
      status: "all" | "open" | "resolved" | "dismissed";
      page: number;
      limit: number;
    };
    res.json({ success: true, data: await adminService.listReports(q) });
  });

  resolveReport = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await adminService.resolveReport(
      actorOf(req),
      getParamId(req.params.id),
      req.body,
    );
    res.json({ success: true, data });
  });

  listAudit = asyncHandler(async (req: AuthRequest, res: Response) => {
    const q = req.query as unknown as { page: number; limit: number };
    res.json({ success: true, data: await adminService.listAudit(q) });
  });

  /** Public (any authenticated user). */
  createReport = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await adminService.createReport(req.user!.userId, req.body);
    res.status(201).json({ success: true, data });
  });
}

export const adminController = new AdminController();
