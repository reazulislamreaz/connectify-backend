export type CallStatus = "ringing" | "active" | "ended";

export interface CallSession {
  callId: string;
  roomId: string;
  callerId: string;
  calleeId: string;
  callerName: string;
  status: CallStatus;
  createdAt: number;
  answeredAt?: number;
}

const calls = new Map<string, CallSession>();
const userActiveCall = new Map<string, string>();

export function registerCall(session: CallSession): void {
  calls.set(session.callId, session);
  userActiveCall.set(session.callerId, session.callId);
}

export function getCall(callId: string): CallSession | undefined {
  return calls.get(callId);
}

export function getUserActiveCallId(userId: string): string | undefined {
  return userActiveCall.get(userId);
}

export function setCallStatus(callId: string, status: CallStatus): CallSession | undefined {
  const call = calls.get(callId);
  if (!call) return undefined;
  call.status = status;
  if (status === "active") {
    call.answeredAt = Date.now();
    userActiveCall.set(call.callerId, callId);
    userActiveCall.set(call.calleeId, callId);
  }
  return call;
}

export function endCall(callId: string): CallSession | undefined {
  const call = calls.get(callId);
  if (!call) return undefined;
  call.status = "ended";
  userActiveCall.delete(call.callerId);
  userActiveCall.delete(call.calleeId);
  calls.delete(callId);
  return call;
}
