import { Server } from "socket.io";

import type { CallLogStatus } from "../constants/call";
import type { MessageType } from "../modules/message/message.model";

export interface MessagePayload {
  id: string;
  senderId: string;
  receiverId: string;
  messageType?: MessageType;
  content: string;
  imageUrl?: string;
  voiceUrl?: string;
  voiceDuration?: number;
  callStatus?: CallLogStatus;
  callDuration?: number;
  read: boolean;
  isDeleted?: boolean;
  editedAt?: Date;
  replyTo?: {
    id: string;
    senderId: string;
    content: string;
    imageUrl?: string;
    voiceUrl?: string;
    isDeleted?: boolean;
  };
  createdAt: Date;
}

let io: Server | null = null;

export function setSocketServer(server: Server): void {
  io = server;
}

function emitToParticipants(
  message: Pick<MessagePayload, "senderId" | "receiverId">,
  event: string,
  payload: unknown
): void {
  if (!io) return;
  io.to(`user:${message.receiverId}`).emit(event, payload);
  io.to(`user:${message.senderId}`).emit(event, payload);
}

export function emitReceiveMessage(message: MessagePayload): void {
  emitToParticipants(message, "receive_message", message);
}

export function emitMessageUpdated(message: MessagePayload): void {
  emitToParticipants(message, "message_updated", message);
}

export function emitMessageDeleted(message: MessagePayload): void {
  emitToParticipants(message, "message_deleted", message);
}

export function emitConversationDeleted(
  userId: string,
  otherUserId: string
): void {
  if (!io) return;
  const payload = { otherUserId };
  io.to(`user:${userId}`).emit("conversation_deleted", payload);
  io.to(`user:${otherUserId}`).emit("conversation_deleted", {
    otherUserId: userId,
  });
}
