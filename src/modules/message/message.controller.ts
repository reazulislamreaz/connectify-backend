import { Response } from "express";
import { AuthRequest } from "../../middleware/auth.middleware";
import { messageService } from "./message.service";
import { asyncHandler } from "../../utils/asyncHandler";
import { getParamId } from "../../utils/params";
import {
  emitReceiveMessage,
  emitMessageUpdated,
  emitMessageDeleted,
} from "../../socket/message.events";

export class MessageController {
  sendMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { receiverId, content, voiceDuration, replyToId } = req.body;
    const files = req.files as
      | { image?: Express.Multer.File[]; voice?: Express.Multer.File[] }
      | undefined;
    const message = await messageService.sendMessage(
      req.user!.userId,
      receiverId,
      content,
      files?.image?.[0],
      files?.voice?.[0],
      voiceDuration,
      replyToId
    );
    emitReceiveMessage(message);
    res.status(201).json({ success: true, data: message });
  });

  updateMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { content, removeImage } = req.body;
    const message = await messageService.updateMessage(
      getParamId(req.params.id),
      req.user!.userId,
      content,
      req.file,
      removeImage
    );
    emitMessageUpdated(message);
    res.json({ success: true, data: message });
  });

  deleteMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
    const message = await messageService.deleteMessage(
      getParamId(req.params.id),
      req.user!.userId
    );
    emitMessageDeleted(message);
    res.json({ success: true, data: message });
  });

  getConversation = asyncHandler(async (req: AuthRequest, res: Response) => {
    const query = req.query as Record<string, string | undefined>;
    const limit = Number(query.limit) || 50;
    const before = query.before;
    const userId = req.user!.userId;
    const otherUserId = getParamId(req.params.userId);

    let result;
    if (before) {
      result = await messageService.getConversation(
        userId,
        otherUserId,
        1,
        limit,
        before,
      );
    } else if (query.page === undefined) {
      result = await messageService.getLatestMessages(userId, otherUserId, limit);
    } else {
      const page = Number(query.page) || 1;
      result = await messageService.getConversation(
        userId,
        otherUserId,
        page,
        limit,
      );
    }

    res.json({ success: true, data: result });
  });

  markAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { senderId } = req.body;
    const result = await messageService.markAsRead(req.user!.userId, senderId);
    res.json({ success: true, data: result });
  });
}

export const messageController = new MessageController();
