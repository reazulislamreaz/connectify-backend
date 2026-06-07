import { getRedis, isRedisEnabled } from "../config/redis";
import type { CallType } from "../constants/call";

export type CallStatus = "ringing" | "active" | "ended";

export interface CallSession {
  callId: string;
  roomId: string;
  callerId: string;
  calleeId: string;
  callerName: string;
  callType: CallType;
  status: CallStatus;
  createdAt: number;
  answeredAt?: number;
}

/**
 * Call signalling state. Shared in Redis so the flow survives across cluster
 * workers (caller and callee usually land on different Node processes), with an
 * in-memory fallback for single-instance/dev when Redis is disabled.
 *
 * Sessions are small and short-lived: TTLs auto-reap anything an `endCall`
 * misses (crash, lost socket), so this can never leak memory.
 */
const RING_TTL_SEC = 60; // a touch above CALL_RING_TIMEOUT_MS (45s)
const ACTIVE_TTL_SEC = 6 * 60 * 60; // backstop for a forgotten long call

const sessionKey = (callId: string) => `call:session:${callId}`;
const userKey = (userId: string) => `call:user:${userId}`;

/** Never let a corrupt/partial Redis value throw and crash the worker. */
function parseSession(raw: string | null): CallSession | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as CallSession;
  } catch (err) {
    console.error("Failed to parse call session:", err);
    return undefined;
  }
}

// In-memory fallback (no Redis → single instance only).
const memCalls = new Map<string, CallSession>();
const memUserActiveCall = new Map<string, string>();

export async function registerCall(session: CallSession): Promise<void> {
  if (!isRedisEnabled()) {
    memCalls.set(session.callId, session);
    memUserActiveCall.set(session.callerId, session.callId);
    memUserActiveCall.set(session.calleeId, session.callId);
    return;
  }
  await getRedis()
    .pipeline()
    .set(sessionKey(session.callId), JSON.stringify(session), "EX", RING_TTL_SEC)
    .set(userKey(session.callerId), session.callId, "EX", RING_TTL_SEC)
    .set(userKey(session.calleeId), session.callId, "EX", RING_TTL_SEC)
    .exec();
}

export async function getCall(
  callId?: string,
): Promise<CallSession | undefined> {
  if (!callId) return undefined;
  if (!isRedisEnabled()) return memCalls.get(callId);
  return parseSession(await getRedis().get(sessionKey(callId)));
}

export async function getUserActiveCallId(
  userId: string,
): Promise<string | undefined> {
  if (!isRedisEnabled()) return memUserActiveCall.get(userId);
  return (await getRedis().get(userKey(userId))) ?? undefined;
}

/** Mark a call active (on accept). Returns the updated session, or undefined if
 * the call no longer exists (e.g. it timed out/was cancelled concurrently). */
export async function setCallStatus(
  callId: string,
  status: CallStatus,
): Promise<CallSession | undefined> {
  if (!isRedisEnabled()) {
    const call = memCalls.get(callId);
    if (!call) return undefined;
    call.status = status;
    if (status === "active") {
      call.answeredAt = Date.now();
      memUserActiveCall.set(call.callerId, callId);
      memUserActiveCall.set(call.calleeId, callId);
    }
    return call;
  }

  const r = getRedis();
  const call = parseSession(await r.get(sessionKey(callId)));
  if (!call) return undefined;
  call.status = status;

  if (status === "active") {
    call.answeredAt = Date.now();
    await r
      .pipeline()
      .set(sessionKey(callId), JSON.stringify(call), "EX", ACTIVE_TTL_SEC)
      .set(userKey(call.callerId), callId, "EX", ACTIVE_TTL_SEC)
      .set(userKey(call.calleeId), callId, "EX", ACTIVE_TTL_SEC)
      .exec();
  } else {
    await r.set(sessionKey(callId), JSON.stringify(call), "KEEPTTL");
  }
  return call;
}

/**
 * Atomically claim and remove a call. Exactly one caller gets the session back;
 * any concurrent finalize (another worker, a fired ring timeout) gets undefined.
 * This is what prevents double call-logs and double "call:ended" emits.
 */
export async function endCall(
  callId: string,
): Promise<CallSession | undefined> {
  if (!isRedisEnabled()) {
    const call = memCalls.get(callId);
    if (!call) return undefined;
    memUserActiveCall.delete(call.callerId);
    memUserActiveCall.delete(call.calleeId);
    memCalls.delete(callId);
    return call;
  }

  const r = getRedis();
  // GETDEL is atomic: the first finalizer wins, the rest see null.
  const raw = (await r.call("GETDEL", sessionKey(callId))) as string | null;
  const call = parseSession(raw);
  if (!call) return undefined;
  await r.del(userKey(call.callerId), userKey(call.calleeId));
  return call;
}
