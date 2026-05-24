import { Response } from "express";
import { AuthRequest } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { callService } from "./call.service";
import { getZegoAppId, getZegoServerUrl } from "../../config/zego";

export class CallController {
  getConfig = asyncHandler(async (_req: AuthRequest, res: Response) => {
    res.json({
      success: true,
      data: {
        appId: getZegoAppId(),
        serverUrl: getZegoServerUrl(),
      },
    });
  });

  createToken = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const { roomId } = req.body as { roomId: string };

    const token = callService.generateRtcToken(userId, roomId);

    res.json({
      success: true,
      data: {
        token,
        roomId,
        appId: getZegoAppId(),
        serverUrl: getZegoServerUrl(),
        userId,
      },
    });
  });
}

export const callController = new CallController();
