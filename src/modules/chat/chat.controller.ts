import { Response } from "express";
import { AuthRequest } from "../../middleware/auth.middleware";
import { chatService } from "./chat.service";
import { messageService } from "../message/message.service";
import { asyncHandler } from "../../utils/asyncHandler";
import { getParamId } from "../../utils/params";
import { emitConversationDeleted } from "../../socket/message.events";

export class ChatController {
  getChatList = asyncHandler(async (req: AuthRequest, res: Response) => {
    const chatList = await chatService.getChatList(req.user!.userId);
    res.json({ success: true, data: chatList });
  });

  deleteConversation = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const otherUserId = getParamId(req.params.userId);
    const result = await messageService.deleteConversation(userId, otherUserId);
    emitConversationDeleted(userId, otherUserId);
    res.json({ success: true, data: result });
  });
}

export const chatController = new ChatController();
