import { Server, Socket } from "socket.io";
import { User } from "../modules/auth/auth.model";
import { callService } from "../modules/call/call.service";
import { messageService } from "../modules/message/message.service";
import type { CallLogStatus } from "../constants/call";
import { createEventRateLimiter } from "./rateLimit";
import {
  endCall,
  getCall,
  getUserActiveCallId,
  registerCall,
  setCallStatus,
  type CallSession,
} from "./call.state";

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

const CALL_RING_TIMEOUT_MS = 45_000;
/** Allow socket reconnect before ending an active call (mobile tab/network blips). */
const CALL_DISCONNECT_GRACE_MS = 15_000;
const ringTimeouts = new Map<string, NodeJS.Timeout>();
const disconnectGraceTimers = new Map<string, NodeJS.Timeout>();

export function clearCallDisconnectGrace(userId: string): void {
  const timer = disconnectGraceTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    disconnectGraceTimers.delete(userId);
  }
}

function clearRingTimeout(callId: string): void {
  const t = ringTimeouts.get(callId);
  if (t) {
    clearTimeout(t);
    ringTimeouts.delete(callId);
  }
}

function mapEndReasonToLogStatus(
  call: CallSession,
  reason: string,
): { status: CallLogStatus; durationSeconds: number } {
  if (call.status === "active" && call.answeredAt) {
    const durationSeconds = Math.max(
      0,
      Math.floor((Date.now() - call.answeredAt) / 1000),
    );
    const status: CallLogStatus =
      reason === "disconnected" ? "disconnected" : "completed";
    return { status, durationSeconds };
  }

  switch (reason) {
    case "rejected":
      return { status: "rejected", durationSeconds: 0 };
    case "cancelled":
      return { status: "cancelled", durationSeconds: 0 };
    case "busy":
      return { status: "busy", durationSeconds: 0 };
    case "timeout":
      return { status: "missed", durationSeconds: 0 };
    case "disconnected":
      return { status: "disconnected", durationSeconds: 0 };
    default:
      return { status: "missed", durationSeconds: 0 };
  }
}

async function finalizeCall(
  io: Server,
  callId: string,
  reason: string,
): Promise<void> {
  const call = getCall(callId);
  if (!call) return;

  clearRingTimeout(callId);

  const { status, durationSeconds } = mapEndReasonToLogStatus(call, reason);
  endCall(callId);

  try {
    await messageService.createCallLogMessage(
      call.callerId,
      call.calleeId,
      status,
      durationSeconds,
    );
  } catch (err) {
    console.error("call log error:", err);
  }

  io.to(`user:${call.callerId}`).emit("call:ended", {
    callId,
    reason,
    duration: durationSeconds,
  });
  io.to(`user:${call.calleeId}`).emit("call:ended", {
    callId,
    reason,
    duration: durationSeconds,
  });
}

function scheduleRingTimeout(io: Server, callId: string): void {
  clearRingTimeout(callId);
  const timeout = setTimeout(() => {
    void finalizeCall(io, callId, "timeout");
  }, CALL_RING_TIMEOUT_MS);
  ringTimeouts.set(callId, timeout);
}

export function setupCallHandlers(io: Server, socket: AuthenticatedSocket): void {
  const userId = socket.userId!;
  const limitCall = createEventRateLimiter(20, 60_000);

  socket.on("call:invite", async (data: { calleeId: string }, callback) => {
    if (!limitCall()) {
      callback?.({ success: false, message: "Rate limit exceeded" });
      return;
    }

    try {
      const calleeId = data?.calleeId;
      if (!calleeId) {
        callback?.({ success: false, message: "calleeId is required" });
        return;
      }

      if (getUserActiveCallId(userId)) {
        callback?.({ success: false, message: "You are already in a call" });
        return;
      }

      await callService.assertCanCall(userId, calleeId);

      if (getUserActiveCallId(calleeId)) {
        callback?.({ success: false, message: "User is busy" });
        return;
      }

      const callee = await User.findById(calleeId).select("name").lean();
      if (!callee) {
        callback?.({ success: false, message: "User not found" });
        return;
      }

      const caller = await User.findById(userId).select("name").lean();
      const callId = callService.createCallId();
      const roomId = callService.createRoomId(userId, calleeId);

      registerCall({
        callId,
        roomId,
        callerId: userId,
        calleeId,
        callerName: caller?.name ?? "Someone",
        status: "ringing",
        createdAt: Date.now(),
      });

      io.to(`user:${calleeId}`).emit("call:incoming", {
        callId,
        roomId,
        callerId: userId,
        callerName: caller?.name ?? "Someone",
      });

      scheduleRingTimeout(io, callId);

      callback?.({
        success: true,
        data: { callId, roomId, calleeId },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start call";
      callback?.({ success: false, message });
    }
  });

  socket.on("call:accept", (data: { callId: string }, callback) => {
    const call = getCall(data?.callId);
    if (!call || call.calleeId !== userId) {
      callback?.({ success: false, message: "Call not found" });
      return;
    }
    if (call.status !== "ringing") {
      callback?.({ success: false, message: "Call is no longer available" });
      return;
    }

    clearRingTimeout(call.callId);
    setCallStatus(call.callId, "active");

    io.to(`user:${call.callerId}`).emit("call:accepted", {
      callId: call.callId,
      roomId: call.roomId,
    });

    callback?.({
      success: true,
      data: { callId: call.callId, roomId: call.roomId },
    });
  });

  socket.on("call:reject", (data: { callId: string }) => {
    const call = getCall(data?.callId);
    if (!call || call.calleeId !== userId || call.status !== "ringing") return;
    void finalizeCall(io, call.callId, "rejected");
  });

  socket.on("call:cancel", (data: { callId: string }) => {
    const call = getCall(data?.callId);
    if (!call || call.callerId !== userId || call.status !== "ringing") return;
    void finalizeCall(io, call.callId, "cancelled");
  });

  socket.on("call:end", (data: { callId: string }) => {
    const call = getCall(data?.callId);
    if (!call) return;
    if (call.callerId !== userId && call.calleeId !== userId) return;

    const reason = call.status === "active" ? "ended" : "cancelled";
    void finalizeCall(io, call.callId, reason);
  });

  socket.on("disconnect", () => {
    clearCallDisconnectGrace(userId);

    const activeCallId = getUserActiveCallId(userId);
    if (!activeCallId) return;

    const call = getCall(activeCallId);
    if (!call) return;

    if (call.status === "ringing") {
      const reason = call.callerId === userId ? "cancelled" : "missed";
      void finalizeCall(io, call.callId, reason);
      return;
    }

    if (call.status === "active") {
      const graceTimer = setTimeout(() => {
        disconnectGraceTimers.delete(userId);
        const current = getCall(activeCallId);
        if (!current || current.status !== "active") return;
        void finalizeCall(io, activeCallId, "disconnected");
      }, CALL_DISCONNECT_GRACE_MS);
      disconnectGraceTimers.set(userId, graceTimer);
    }
  });
}
