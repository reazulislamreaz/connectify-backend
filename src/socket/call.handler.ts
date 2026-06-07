import { Server, Socket } from "socket.io";
import { User } from "../modules/auth/auth.model";
import { AppError } from "../utils/AppError";
import { resolveImageUrl } from "../config/s3";
import { callService } from "../modules/call/call.service";
import { messageService } from "../modules/message/message.service";
import {
  CALL_TYPE,
  DEFAULT_CALL_TYPE,
  type CallLogStatus,
  type CallType,
} from "../constants/call";
import { createEventRateLimiter } from "./rateLimit";
import { presenceService } from "../services/presence.service";
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

function normalizeCallType(value: unknown): CallType {
  return CALL_TYPE.includes(value as CallType)
    ? (value as CallType)
    : DEFAULT_CALL_TYPE;
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
  // Atomically claim the call — only the first finalizer proceeds, so we never
  // write two call-logs or emit "ended" twice (e.g. a fired ring timeout racing
  // a reject from another worker).
  const call = await endCall(callId);
  if (!call) return;

  clearRingTimeout(callId);

  const { status, durationSeconds } = mapEndReasonToLogStatus(call, reason);

  try {
    await messageService.createCallLogMessage(
      call.callerId,
      call.calleeId,
      status,
      durationSeconds,
      call.callType,
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
    ringTimeouts.delete(callId);
    // The accept may have happened on another worker (which can't clear this
    // local timer), so re-check shared state and only time out a call that's
    // genuinely still ringing.
    void (async () => {
      try {
        const call = await getCall(callId);
        if (call?.status === "ringing") {
          await finalizeCall(io, callId, "timeout");
        }
      } catch (err) {
        console.error("ring timeout error:", err);
      }
    })();
  }, CALL_RING_TIMEOUT_MS);
  ringTimeouts.set(callId, timeout);
}

export function setupCallHandlers(io: Server, socket: AuthenticatedSocket): void {
  const userId = socket.userId!;
  const limitCall = createEventRateLimiter(20, 60_000);

  socket.on("call:invite", async (data: { calleeId: string; callType?: CallType }, callback) => {
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

      const callType = normalizeCallType(data?.callType);

      if (await getUserActiveCallId(userId)) {
        callback?.({ success: false, message: "You are already in a call" });
        return;
      }

      await callService.assertCanCall(userId, calleeId);

      if (await getUserActiveCallId(calleeId)) {
        callback?.({ success: false, message: "User is busy" });
        return;
      }

      const callee = await User.findById(calleeId).select("name").lean();
      if (!callee) {
        callback?.({ success: false, message: "User not found" });
        return;
      }

      const caller = await User.findById(userId)
        .select("name profilePicture")
        .lean();
      const callerAvatar = resolveImageUrl(caller?.profilePicture);
      const callId = callService.createCallId();
      const roomId = callService.createRoomId(userId, calleeId);

      await registerCall({
        callId,
        roomId,
        callerId: userId,
        calleeId,
        callerName: caller?.name ?? "Someone",
        callType,
        status: "ringing",
        createdAt: Date.now(),
      });

      io.to(`user:${calleeId}`).emit("call:incoming", {
        callId,
        roomId,
        callerId: userId,
        callerName: caller?.name ?? "Someone",
        callerAvatar,
        callType,
      });

      scheduleRingTimeout(io, callId);

      callback?.({
        success: true,
        data: { callId, roomId, calleeId, callType },
      });
    } catch (err) {
      const message =
        err instanceof AppError || err instanceof Error
          ? err.message
          : "Failed to start call";
      callback?.({ success: false, message });
    }
  });

  socket.on("call:accept", async (data: { callId: string }, callback) => {
    const call = await getCall(data?.callId);
    if (!call || call.calleeId !== userId) {
      callback?.({ success: false, message: "Call not found" });
      return;
    }
    if (call.status !== "ringing") {
      callback?.({ success: false, message: "Call is no longer available" });
      return;
    }

    clearRingTimeout(call.callId);
    // If a ring-timeout/cancel ended the call concurrently, setCallStatus
    // returns undefined — don't tell the caller it connected.
    const active = await setCallStatus(call.callId, "active");
    if (!active) {
      callback?.({ success: false, message: "Call is no longer available" });
      return;
    }

    io.to(`user:${call.callerId}`).emit("call:accepted", {
      callId: call.callId,
      roomId: call.roomId,
      callType: call.callType,
    });

    callback?.({
      success: true,
      data: {
        callId: call.callId,
        roomId: call.roomId,
        callType: call.callType,
      },
    });
  });

  socket.on("call:reject", async (data: { callId: string }) => {
    const call = await getCall(data?.callId);
    if (!call || call.calleeId !== userId || call.status !== "ringing") return;
    void finalizeCall(io, call.callId, "rejected");
  });

  socket.on("call:cancel", async (data: { callId: string }) => {
    const call = await getCall(data?.callId);
    if (!call || call.callerId !== userId || call.status !== "ringing") return;
    void finalizeCall(io, call.callId, "cancelled");
  });

  socket.on("call:end", async (data: { callId: string }) => {
    const call = await getCall(data?.callId);
    if (!call) return;
    if (call.callerId !== userId && call.calleeId !== userId) return;

    const reason = call.status === "active" ? "ended" : "cancelled";
    void finalizeCall(io, call.callId, reason);
  });

  socket.on("disconnect", async () => {
    clearCallDisconnectGrace(userId);

    const activeCallId = await getUserActiveCallId(userId);
    if (!activeCallId) return;

    const call = await getCall(activeCallId);
    if (!call) return;

    if (call.status === "ringing") {
      const reason = call.callerId === userId ? "cancelled" : "missed";
      void finalizeCall(io, call.callId, reason);
      return;
    }

    if (call.status === "active") {
      const graceTimer = setTimeout(() => {
        disconnectGraceTimers.delete(userId);
        void (async () => {
          try {
            // A reconnect can land on a different worker, so the local grace
            // clear never runs there. Trust shared presence: if they're back
            // online anywhere in the cluster, keep the call alive.
            if (await presenceService.isOnline(userId)) return;
            const current = await getCall(activeCallId);
            if (!current || current.status !== "active") return;
            await finalizeCall(io, activeCallId, "disconnected");
          } catch (err) {
            console.error("disconnect grace error:", err);
          }
        })();
      }, CALL_DISCONNECT_GRACE_MS);
      disconnectGraceTimers.set(userId, graceTimer);
    }
  });
}
