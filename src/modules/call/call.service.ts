import crypto from "crypto";
import { generateToken04 } from "../../utils/zegoServerAssistant";
import { env } from "../../config/env";
import { getZegoAppId, getZegoServerSecret } from "../../config/zego";
import { friendRequestService } from "../friendRequest/friendRequest.service";
import { AppError } from "../../utils/AppError";

const TOKEN_TTL_SECONDS = 3600;

export class CallService {
  createRoomId(callerId: string, calleeId: string): string {
    const pair = [callerId, calleeId].sort().join("_");
    const nonce = crypto.randomBytes(4).toString("hex");
    return `call_${pair}_${nonce}`;
  }

  createCallId(): string {
    return crypto.randomUUID();
  }

  async assertCanCall(userId: string, otherUserId: string): Promise<void> {
    if (userId === otherUserId) {
      throw new AppError(400, "Cannot call yourself");
    }
    const areFriends = await friendRequestService.areFriends(userId, otherUserId);
    if (!areFriends) {
      throw new AppError(403, "You can only call friends");
    }
  }

  generateRtcToken(userId: string, roomId: string): string {
    const appId = getZegoAppId();
    if (!appId) {
      throw new AppError(
        503,
        "ZEGOCLOUD_APP_ID must be a numeric App ID from the ZEGOCLOUD console",
      );
    }

    if (!env.ZEGOCLOUD_SERVER_SECRET.trim()) {
      throw new AppError(503, "ZEGOCLOUD_SERVER_SECRET is not configured");
    }
    const secret = getZegoServerSecret();

    try {
      const payload = JSON.stringify({
        room_id: roomId,
        privilege: { 1: 1, 2: 1 },
        stream_id_list: null,
      });
      return generateToken04(
        appId,
        userId,
        secret,
        TOKEN_TTL_SECONDS,
        payload,
      );
    } catch (err) {
      const message =
        err && typeof err === "object" && "errorMessage" in err
          ? String((err as { errorMessage: string }).errorMessage)
          : "Failed to generate Zego token";
      throw new AppError(500, message);
    }
  }
}

export const callService = new CallService();
