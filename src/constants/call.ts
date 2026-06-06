export const CALL_LOG_STATUS = [
  "completed",
  "rejected",
  "cancelled",
  "missed",
  "busy",
  "disconnected",
] as const;

export type CallLogStatus = (typeof CALL_LOG_STATUS)[number];

export const CALL_TYPE = ["audio", "video"] as const;

export type CallType = (typeof CALL_TYPE)[number];

export const DEFAULT_CALL_TYPE: CallType = "audio";
