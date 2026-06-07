import { Server } from "socket.io";

import type { CallLogStatus, CallType } from "../constants/call";
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
  callType?: CallType;
  delivered?: boolean;
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

export function getSocketServer(): Server | null {
  return io;
}

/** Live socket connections on THIS worker only. */
export function getConnectionCount(): number {
  return io ? io.engine.clientsCount : 0;
}

/**
 * Live socket connections across the whole cluster (via the Redis adapter).
 * Falls back to this worker's local count if the adapter call fails.
 */
export async function getClusterConnectionCount(): Promise<number> {
  if (!io) return 0;
  try {
    const ids = await io.of("/").adapter.sockets(new Set());
    return ids.size;
  } catch {
    return io.engine.clientsCount;
  }
}

/**
 * Force a user out of all live sessions by disconnecting their sockets.
 * Note: a stateless JWT stays valid until it expires — for full revocation add
 * a per-user tokenVersion to the JWT and check it in authenticate(). This kicks
 * active connections immediately, which is what a moderator expects to see.
 */
export function disconnectUser(userId: string): void {
  io?.to(`user:${userId}`).disconnectSockets(true);
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
