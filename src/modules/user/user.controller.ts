import { Response } from "express";
import { AuthRequest } from "../../middleware/auth.middleware";
import { userService } from "./user.service";
import { friendRequestService } from "../friendRequest/friendRequest.service";
import { asyncHandler } from "../../utils/asyncHandler";
import { getParamId } from "../../utils/params";

export class UserController {
  getProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await userService.getProfile(req.user!.userId);
    res.json({ success: true, data: user });
  });

  updateProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name, address, professional, religious, hobby, relationStatus, dateOfBirth } =
      req.body;

    const user = await userService.updateProfile(req.user!.userId, {
      name,
      address,
      professional,
      religious,
      hobby,
      relationStatus,
      dateOfBirth,
      imageFile: req.file,
    });

    res.json({ success: true, data: user });
  });

  listUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
    const query = req.query as Record<string, string | undefined>;
    const search = query.search;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const currentUserId = req.user!.userId;
    const result = await userService.listUsers(currentUserId, search, page, limit);
    const relationships = await friendRequestService.getRelationshipStatusesForUsers(
      currentUserId,
      result.users.map((user) => user.id)
    );
    const users = result.users.map((user) => ({
      ...user,
      relationship: relationships.get(user.id) ?? { status: "none" as const },
    }));

    res.json({ success: true, data: { ...result, users } });
  });

  getUserById = asyncHandler(async (req: AuthRequest, res: Response) => {
    const targetId = getParamId(req.params.id);
    const user = await userService.getUserById(targetId);
    const relationship = await friendRequestService.getRelationshipStatus(
      req.user!.userId,
      targetId
    );
    res.json({ success: true, data: { ...user, relationship } });
  });
}

export const userController = new UserController();
