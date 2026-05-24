import { Response } from "express";
import { AuthRequest } from "../../middleware/auth.middleware";
import { friendRequestService } from "./friendRequest.service";
import { asyncHandler } from "../../utils/asyncHandler";
import { getParamId } from "../../utils/params";

export class FriendRequestController {
  sendRequest = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { receiverId } = req.body;
    const request = await friendRequestService.sendRequest(req.user!.userId, receiverId);
    res.status(201).json({ success: true, data: request });
  });

  respondToRequest = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { action } = req.body;
    const request = await friendRequestService.respondToRequest(
      getParamId(req.params.id),
      req.user!.userId,
      action
    );
    res.json({ success: true, data: request });
  });

  getPendingReceived = asyncHandler(async (req: AuthRequest, res: Response) => {
    const requests = await friendRequestService.getPendingReceived(req.user!.userId);
    res.json({ success: true, data: requests });
  });

  getPendingSent = asyncHandler(async (req: AuthRequest, res: Response) => {
    const requests = await friendRequestService.getPendingSent(req.user!.userId);
    res.json({ success: true, data: requests });
  });

  getFriends = asyncHandler(async (req: AuthRequest, res: Response) => {
    const friends = await friendRequestService.getFriends(req.user!.userId);
    res.json({ success: true, data: friends });
  });

  cancelRequest = asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await friendRequestService.cancelRequest(
      getParamId(req.params.id),
      req.user!.userId
    );
    res.json({ success: true, data: result });
  });
}

export const friendRequestController = new FriendRequestController();
