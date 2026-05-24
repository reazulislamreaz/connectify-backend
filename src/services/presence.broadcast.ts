import { Server } from "socket.io";
import { cacheInvalidate } from "../cache/invalidate";
import { friendRequestService } from "../modules/friendRequest/friendRequest.service";

export interface UserPresencePayload {
  userId: string;
  isOnline: boolean;
  lastSeen?: string;
}

/** Notify only friends — avoids global broadcast at scale. */
export async function broadcastPresenceToFriends(
  io: Server,
  userId: string,
  isOnline: boolean,
  lastSeen?: Date,
): Promise<void> {
  try {
    const friendIds = await friendRequestService.getFriendIds(userId);
    if (friendIds.length === 0) return;

    const payload: UserPresencePayload = {
      userId,
      isOnline,
      ...(lastSeen ? { lastSeen: lastSeen.toISOString() } : {}),
    };

    for (const friendId of friendIds) {
      io.to(`user:${friendId}`).emit("user_presence", payload);
    }

    await invalidatePresenceCaches(userId, friendIds);
  } catch (err) {
    console.error("[presence] broadcast to friends failed:", err);
  }
}

async function invalidatePresenceCaches(
  userId: string,
  friendIds: string[],
): Promise<void> {
  await cacheInvalidate.user(userId);
  await cacheInvalidate.chatList(userId);
  const chatListInvalidations = friendIds.map((id) => cacheInvalidate.chatList(id));
  await Promise.all(chatListInvalidations);
}
