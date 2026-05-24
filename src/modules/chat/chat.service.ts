import mongoose from "mongoose";
import { Message } from "../message/message.model";
import { friendRequestService } from "../friendRequest/friendRequest.service";
import { resolveImageUrl } from "../../config/s3";
import { cache } from "../../cache/cache.service";
import { keys, TTL } from "../../cache/keys";

export class ChatService {
  async getChatList(userId: string) {
    return cache.getOrSet(keys.chatList(userId), TTL.CHAT_LIST, () =>
      this.buildChatList(userId)
    );
  }

  private async buildChatList(userId: string) {
    const friends = await friendRequestService.getFriends(userId);
    if (friends.length === 0) return [];

    const friendIds = friends.map((f) => new mongoose.Types.ObjectId(f.id));
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const [lastMessages, unreadCounts] = await Promise.all([
      Message.aggregate<{
        _id: mongoose.Types.ObjectId;
          lastMessage: {
            _id: mongoose.Types.ObjectId;
            messageType?: string;
            content: string;
            imageUrl?: string;
            voiceUrl?: string;
            voiceDuration?: number;
            callStatus?: string;
            callDuration?: number;
            isDeleted?: boolean;
            senderId: mongoose.Types.ObjectId;
            createdAt: Date;
            read: boolean;
          };
      }>([
        {
          $match: {
            $or: [
              { senderId: userObjectId, receiverId: { $in: friendIds } },
              { senderId: { $in: friendIds }, receiverId: userObjectId },
            ],
          },
        },
        { $sort: { createdAt: -1 } },
        {
          $addFields: {
            friendId: {
              $cond: [
                { $eq: ["$senderId", userObjectId] },
                "$receiverId",
                "$senderId",
              ],
            },
          },
        },
        {
          $group: {
            _id: "$friendId",
            lastMessage: { $first: "$$ROOT" },
          },
        },
        {
          $project: {
            _id: 1,
            lastMessage: {
              _id: "$lastMessage._id",
              messageType: "$lastMessage.messageType",
              content: "$lastMessage.content",
              imageUrl: "$lastMessage.imageUrl",
              voiceUrl: "$lastMessage.voiceUrl",
              voiceDuration: "$lastMessage.voiceDuration",
              callStatus: "$lastMessage.callStatus",
              callDuration: "$lastMessage.callDuration",
              isDeleted: "$lastMessage.isDeleted",
              senderId: "$lastMessage.senderId",
              createdAt: "$lastMessage.createdAt",
              read: "$lastMessage.read",
            },
          },
        },
      ]),
      Message.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
        {
          $match: {
            receiverId: userObjectId,
            senderId: { $in: friendIds },
            read: false,
          },
        },
        { $group: { _id: "$senderId", count: { $sum: 1 } } },
      ]),
    ]);

    const lastMessageMap = new Map(
      lastMessages.map((m) => [m._id.toString(), m.lastMessage])
    );
    const unreadMap = new Map(
      unreadCounts.map((u) => [u._id.toString(), u.count])
    );

    return friends
      .map((friend) => {
        const last = lastMessageMap.get(friend.id);
        return {
          user: friend,
          lastMessage: last
            ? {
                id: last._id.toString(),
                messageType: last.messageType === "call" ? "call" : "text",
                content: last.content || "",
                imageUrl: last.imageUrl ? resolveImageUrl(last.imageUrl) : undefined,
                voiceUrl: last.voiceUrl ? resolveImageUrl(last.voiceUrl) : undefined,
                voiceDuration: last.voiceDuration || undefined,
                callStatus: last.callStatus,
                callDuration: last.callDuration,
                isDeleted: Boolean(last.isDeleted),
                senderId: last.senderId.toString(),
                createdAt: last.createdAt,
                read: last.read,
              }
            : null,
          unreadCount: unreadMap.get(friend.id) ?? 0,
        };
      })
      .sort((a, b) => {
        const aTime = a.lastMessage?.createdAt?.getTime() ?? 0;
        const bTime = b.lastMessage?.createdAt?.getTime() ?? 0;
        return bTime - aTime;
      });
  }
}

export const chatService = new ChatService();
