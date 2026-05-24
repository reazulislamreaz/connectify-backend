import { Server, Socket } from "socket.io";
import { verifyToken } from "../utils/jwt";
import { messageService } from "../modules/message/message.service";
import { presenceService } from "../services/presence.service";
import { broadcastPresenceToFriends } from "../services/presence.broadcast";
import { setSocketServer, emitReceiveMessage } from "./message.events";
import { createEventRateLimiter } from "./rateLimit";
import { clearCallDisconnectGrace, setupCallHandlers } from "./call.handler";

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

export function setupSocket(io: Server): void {
  setSocketServer(io);

  io.use((socket: AuthenticatedSocket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.toString().replace("Bearer ", "");

    if (!token) {
      next(new Error("Authentication required"));
      return;
    }

    try {
      const payload = verifyToken(token);
      socket.userId = payload.userId;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", async (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    clearCallDisconnectGrace(userId);
    socket.join(`user:${userId}`);

    const limitSend = createEventRateLimiter(60, 60_000);
    const limitTyping = createEventRateLimiter(120, 60_000);
    const limitRead = createEventRateLimiter(120, 60_000);

    await presenceService.markOnline(userId);
    void broadcastPresenceToFriends(io, userId, true);

    const presenceHeartbeat = setInterval(() => {
      void presenceService.refreshOnline(userId);
    }, 45_000);

    socket.on(
      "send_message",
      async (data: { receiverId: string; content: string; replyToId?: string }, callback) => {
        if (!limitSend()) {
          if (typeof callback === "function") {
            callback({ success: false, message: "Rate limit exceeded. Slow down." });
          }
          return;
        }

        try {
          const message = await messageService.sendMessage(
            userId,
            data.receiverId,
            data.content,
            undefined,
            undefined,
            0,
            data.replyToId
          );

          emitReceiveMessage(message);

          if (typeof callback === "function") {
            callback({ success: true, data: message });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to send message";
          if (typeof callback === "function") {
            callback({ success: false, message });
          }
        }
      },
    );

    socket.on("message_read", async (data: { senderId: string }) => {
      if (!limitRead()) return;

      try {
        const result = await messageService.markAsRead(userId, data.senderId);
        io.to(`user:${data.senderId}`).emit("messages_read", {
          readerId: userId,
          modifiedCount: result.modifiedCount,
        });
      } catch (err) {
        console.error("message_read error:", err);
      }
    });

    socket.on("typing", (data: { receiverId: string; isTyping: boolean }) => {
      if (!limitTyping()) return;

      io.to(`user:${data.receiverId}`).emit("typing", {
        userId,
        isTyping: data.isTyping,
      });
    });

    setupCallHandlers(io, socket);

    socket.on("disconnect", async () => {
      clearInterval(presenceHeartbeat);
      const lastSeen = new Date();
      await presenceService.markOffline(userId);
      void broadcastPresenceToFriends(io, userId, false, lastSeen);
    });
  });
}
